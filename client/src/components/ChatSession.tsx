import { useEffect, useRef, useState } from 'react'
import { postChatStream, postCapsules, type ChatMessage, type Capsule } from '../lib/api'
import { upsertSession, type SavedChatSession } from '../lib/sessionHistory'
import { looksLikeFocusSelection } from '../lib/focusSelection'
import { stripLeadingSuggestMeta } from '../lib/stripSuggestMeta'
import { useSpeechRecognition } from '../hooks/useSpeechRecognition'
import { CapsuleBoard } from './CapsuleBoard'

function PhaseBadge({
  outlineMode,
  focusChosen,
  awaitingFocusPick,
}: {
  outlineMode: boolean
  focusChosen: boolean
  awaitingFocusPick: boolean
}) {
  let label = '发散聊聊'
  let sub = '想到什么说什么'
  if (outlineMode) {
    label = '整理大纲'
    sub = '拖动胶囊排序'
  } else if (awaitingFocusPick) {
    label = '梳理重点'
    sub = '可补充遗漏，或多选编号'
  } else if (focusChosen) {
    label = '准备大纲'
    sub = '点「整理大纲」或说出这四个字'
  }
  return (
    <div className="rounded-full border border-stone-200 bg-white/90 px-3 py-1 text-left text-xs dark:border-stone-600 dark:bg-stone-900/90">
      <span className="font-semibold text-stone-800 dark:text-stone-100">{label}</span>
      <span className="text-stone-500"> · {sub}</span>
    </div>
  )
}

export function ChatSession({
  topic,
  sessionId,
  resumeFrom,
  onBack,
}: {
  topic: string
  sessionId: string
  resumeFrom: SavedChatSession | null
  onBack: () => void
}) {
  const [messages, setMessages] = useState<ChatMessage[]>(() => resumeFrom?.messages ?? [])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [suggestConverge, setSuggestConverge] = useState(() => resumeFrom?.suggestConverge ?? false)
  const [awaitingFocusPick, setAwaitingFocusPick] = useState(
    () => resumeFrom?.awaitingFocusPick ?? false,
  )
  const [focusChosen, setFocusChosen] = useState(() => resumeFrom?.focusChosen ?? false)
  const [chosenFocus, setChosenFocus] = useState<string | undefined>(() => resumeFrom?.chosenFocus)
  const [outlineMode, setOutlineMode] = useState(() => resumeFrom?.outlineMode ?? false)
  const [capsules, setCapsules] = useState<Capsule[]>(
    () => resumeFrom?.capsules?.map((c) => ({ ...c })) ?? [],
  )
  const [input, setInput] = useState('')

  const bottomRef = useRef<HTMLDivElement>(null)
  /** 点「语音」那一刻输入框里已有的字，与 live 识别结果拼接展示 */
  const micPrefixRef = useRef('')
  const { supported, listening, liveTranscript, listenOnce, cancel } = useSpeechRecognition()

  const displayInput =
    listening && supported ? `${micPrefixRef.current}${liveTranscript}` : input

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading, outlineMode])

  useEffect(() => {
    const payload: SavedChatSession = {
      id: sessionId,
      topic,
      updatedAt: Date.now(),
      messages,
      suggestConverge,
      awaitingFocusPick,
      focusChosen,
      chosenFocus,
      outlineMode,
      capsules,
    }
    const t = window.setTimeout(() => upsertSession(payload), 400)
    return () => clearTimeout(t)
  }, [
    sessionId,
    topic,
    messages,
    suggestConverge,
    awaitingFocusPick,
    focusChosen,
    chosenFocus,
    outlineMode,
    capsules,
  ])

  const resumeKey = resumeFrom?.id ?? ''
  useEffect(() => {
    if (resumeFrom && resumeFrom.messages.length > 0) {
      return
    }
    let alive = true
    ;(async () => {
      setLoading(true)
      setError(null)
      setMessages([{ role: 'assistant', content: '' }])
      try {
        const { suggest_converge } = await postChatStream(
          { topic, stage: 'opening', messages: [] },
          (t) => {
            if (!alive) return
            setMessages((prev) => {
              const a = prev[0]
              if (!a || a.role !== 'assistant') return prev
              return [{ ...a, content: a.content + t }]
            })
          },
          (rep) => {
            if (!alive) return
            setMessages((prev) => {
              const a = prev[0]
              if (!a || a.role !== 'assistant') return prev
              return [{ ...a, content: rep }]
            })
          },
        )
        if (!alive) return
        setSuggestConverge(suggest_converge)
      } catch (e) {
        if (!alive) return
        setError(e instanceof Error ? e.message : '开场失败')
        setMessages([])
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => {
      alive = false
    }
  }, [topic, sessionId, resumeKey])

  function handleBack() {
    upsertSession({
      id: sessionId,
      topic,
      updatedAt: Date.now(),
      messages,
      suggestConverge,
      awaitingFocusPick,
      focusChosen,
      chosenFocus,
      outlineMode,
      capsules,
    })
    onBack()
  }

  const userTurnCount = messages.filter((m) => m.role === 'user').length

  async function triggerFocusPrompt() {
    if (loading || focusChosen || awaitingFocusPick) return
    const u: ChatMessage = { role: 'user', content: '聊够了，请帮我梳理写作重点。' }
    const hist = [...messages, u]
    setMessages([...hist, { role: 'assistant', content: '' }])
    setLoading(true)
    setError(null)
    try {
      await postChatStream(
        { topic, stage: 'focus_prompt', messages: hist },
        (t) => {
          setMessages((prev) => {
            const copy = [...prev]
            const i = copy.length - 1
            const last = copy[i]
            if (last?.role !== 'assistant') return prev
            copy[i] = { ...last, content: last.content + t }
            return copy
          })
        },
        (rep) => {
          setMessages((prev) => {
            const copy = [...prev]
            const i = copy.length - 1
            const last = copy[i]
            if (last?.role !== 'assistant') return prev
            copy[i] = { ...last, content: rep }
            return copy
          })
        },
      )
      setAwaitingFocusPick(true)
      setSuggestConverge(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : '梳理重点失败')
      setMessages((prev) => prev.slice(0, -2))
    } finally {
      setLoading(false)
    }
  }

  async function loadCapsules(hist: ChatMessage[]) {
    setLoading(true)
    setError(null)
    try {
      const { capsules: caps } = await postCapsules({
        topic,
        messages: hist,
        chosenFocus,
      })
      setCapsules(caps)
      setOutlineMode(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : '生成胶囊失败')
    } finally {
      setLoading(false)
    }
  }

  async function sendFromInput() {
    const text = input.trim()
    if (!text || loading) return
    setInput('')

    const mentionsOutline = text.includes('整理大纲')

    if (mentionsOutline && !focusChosen) {
      setError('请先用编号多选想写的重点并完成伙伴的确认，再整理大纲哦。')
      return
    }

    const u: ChatMessage = { role: 'user', content: text }
    let hist = [...messages, u]
    setMessages(hist)

    if (mentionsOutline && focusChosen) {
      await loadCapsules(hist)
      return
    }

    if (awaitingFocusPick) {
      const focusStage = looksLikeFocusSelection(text) ? 'focus_confirm' : 'focus_prompt'
      setMessages([...hist, { role: 'assistant', content: '' }])
      setLoading(true)
      setError(null)
      try {
        await postChatStream(
          { topic, stage: focusStage, messages: hist },
          (t) => {
            setMessages((prev) => {
              const copy = [...prev]
              const i = copy.length - 1
              const last = copy[i]
              if (last?.role !== 'assistant') return prev
              copy[i] = { ...last, content: last.content + t }
              return copy
            })
          },
          (rep) => {
            setMessages((prev) => {
              const copy = [...prev]
              const i = copy.length - 1
              const last = copy[i]
              if (last?.role !== 'assistant') return prev
              copy[i] = { ...last, content: rep }
              return copy
            })
          },
        )
        if (focusStage === 'focus_confirm') {
          setAwaitingFocusPick(false)
          setFocusChosen(true)
          setChosenFocus(text)
        }
      } catch (e) {
        setError(
          e instanceof Error
            ? e.message
            : focusStage === 'focus_confirm'
              ? '确认失败'
              : '更新重点列表失败',
        )
        setMessages((prev) => prev.slice(0, -2))
      } finally {
        setLoading(false)
      }
      return
    }

    setMessages([...hist, { role: 'assistant', content: '' }])
    setLoading(true)
    setError(null)
    try {
      const { suggest_converge } = await postChatStream(
        { topic, stage: 'diverge', messages: hist },
        (t) => {
          setMessages((prev) => {
            const copy = [...prev]
            const i = copy.length - 1
            const last = copy[i]
            if (last?.role !== 'assistant') return prev
            copy[i] = { ...last, content: last.content + t }
            return copy
          })
        },
        (rep) => {
          setMessages((prev) => {
            const copy = [...prev]
            const i = copy.length - 1
            const last = copy[i]
            if (last?.role !== 'assistant') return prev
            copy[i] = { ...last, content: rep }
            return copy
          })
        },
      )
      setSuggestConverge(suggest_converge)
    } catch (e) {
      setError(e instanceof Error ? e.message : '发送失败')
      setMessages((prev) => prev.slice(0, -2))
    } finally {
      setLoading(false)
    }
  }

  async function onMic() {
    setError(null)
    micPrefixRef.current = input
    try {
      const text = await listenOnce()
      const p = micPrefixRef.current
      if (text) setInput(p ? `${p}${text}` : text)
      else setInput(p)
    } catch (e) {
      setError(e instanceof Error ? e.message : '语音识别失败')
    }
  }

  const showSuggestCta = suggestConverge && !awaitingFocusPick && !focusChosen && !outlineMode
  const canManualFocus = userTurnCount >= 2 && !awaitingFocusPick && !focusChosen && !outlineMode

  return (
    <div className="flex min-h-svh flex-col bg-stone-100 text-stone-900 dark:bg-stone-950 dark:text-stone-100">
      <header className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-2 border-b border-stone-200 bg-stone-100/95 px-4 py-3 backdrop-blur dark:border-stone-800 dark:bg-stone-950/95">
        <button
          type="button"
          onClick={handleBack}
          className="rounded-xl px-2 py-1 text-sm text-stone-600 hover:bg-stone-200 dark:text-stone-400 dark:hover:bg-stone-800"
        >
          ← 结束
        </button>
        <PhaseBadge
          outlineMode={outlineMode}
          focusChosen={focusChosen}
          awaitingFocusPick={awaitingFocusPick}
        />
      </header>

      <div className="mx-auto grid w-full max-w-6xl flex-1 gap-4 p-4 lg:grid-cols-2 lg:items-stretch">
        <div className="flex min-h-[50vh] flex-col rounded-2xl border border-stone-200 bg-white shadow-sm dark:border-stone-800 dark:bg-stone-900">
          <div className="border-b border-stone-100 px-4 py-3 text-left dark:border-stone-800">
            <p className="text-xs font-medium uppercase tracking-wider text-amber-700 dark:text-amber-400">
              题目
            </p>
            <p className="font-display text-lg font-semibold">{topic}</p>
          </div>

          <div className="flex min-h-0 flex-1 flex-col">
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
              {error ? (
                <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-800 dark:bg-rose-950/40 dark:text-rose-200">
                  {error}
                </p>
              ) : null}
              {messages.map((m, i) => (
                <div
                  key={`${i}-${m.content.slice(0, 12)}`}
                  className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[90%] rounded-2xl px-3 py-2 text-sm leading-relaxed ${
                      m.role === 'user'
                        ? 'bg-amber-500 text-stone-900'
                        : 'bg-stone-100 text-stone-800 dark:bg-stone-800 dark:text-stone-100'
                    }`}
                  >
                    {m.role === 'assistant' &&
                    !stripLeadingSuggestMeta(m.content).trim() &&
                    loading &&
                    i === messages.length - 1 ? (
                      <span className="text-stone-400">正在组织语言，请稍等…</span>
                    ) : m.role === 'assistant' ? (
                      stripLeadingSuggestMeta(m.content)
                    ) : (
                      m.content
                    )}
                  </div>
                </div>
              ))}
              {loading ? (
                <p className="text-center text-xs text-stone-400">伙伴正在想…</p>
              ) : null}
              <div ref={bottomRef} />
            </div>

            {!outlineMode ? (
              <div className="border-t border-stone-100 p-3 dark:border-stone-800">
                {(showSuggestCta || canManualFocus) && (
                  <div className="mb-2 flex flex-wrap gap-2">
                    {showSuggestCta ? (
                      <button
                        type="button"
                        onClick={() => void triggerFocusPrompt()}
                        disabled={loading}
                        className="rounded-xl bg-stone-900 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50 dark:bg-amber-500 dark:text-stone-900"
                      >
                        好，梳理重点
                      </button>
                    ) : null}
                    {canManualFocus && !showSuggestCta ? (
                      <button
                        type="button"
                        onClick={() => void triggerFocusPrompt()}
                        disabled={loading}
                        className="rounded-xl border border-stone-300 px-3 py-2 text-xs font-medium text-stone-700 dark:border-stone-600 dark:text-stone-200"
                      >
                        聊够了，梳理重点
                      </button>
                    ) : null}
                  </div>
                )}
                {focusChosen ? (
                  <button
                    type="button"
                    onClick={() => void loadCapsules(messages)}
                    disabled={loading}
                    className="mb-2 w-full rounded-xl border-2 border-dashed border-amber-400/80 py-2 text-sm font-semibold text-amber-800 dark:text-amber-200"
                  >
                    整理大纲
                  </button>
                ) : null}

                <div className="flex gap-2">
                  <textarea
                    value={displayInput}
                    readOnly={listening}
                    onChange={(e) => {
                      if (listening) return
                      setInput(e.target.value)
                    }}
                    onKeyDown={(e) => {
                      if (listening) return
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault()
                        void sendFromInput()
                      }
                    }}
                    rows={2}
                    placeholder={
                      awaitingFocusPick
                        ? '有遗漏就先补充细节；没有则用编号多选，如 1、3'
                        : '打字或先用语音…'
                    }
                    className="min-h-[48px] flex-1 resize-none rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none dark:border-stone-700 dark:bg-stone-950 read-only:opacity-95"
                  />
                  <div className="flex shrink-0 flex-col gap-1">
                    {supported ? (
                      <button
                        type="button"
                        onClick={() => (listening ? cancel() : void onMic())}
                        className={`rounded-xl px-3 py-2 text-xs font-semibold ${
                          listening
                            ? 'bg-rose-500 text-white'
                            : 'bg-stone-200 text-stone-800 dark:bg-stone-800 dark:text-stone-100'
                        }`}
                      >
                        {listening ? '完成' : '语音'}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => void sendFromInput()}
                      disabled={loading || listening || !displayInput.trim()}
                      className="rounded-xl bg-amber-500 px-3 py-2 text-xs font-semibold text-stone-900 disabled:opacity-40"
                    >
                      发送
                    </button>
                  </div>
                </div>
                {supported ? (
                  <p className="mt-1 text-[10px] text-stone-400">
                    说话时识别文字会同步出现在输入框；可连续说多句，点「完成」结束。
                  </p>
                ) : (
                  <p className="mt-1 text-[10px] text-stone-400">
                    当前浏览器不支持语音，可直接打字。
                  </p>
                )}
              </div>
            ) : (
              <div className="border-t border-stone-100 p-3 text-left text-xs text-stone-500 dark:border-stone-800">
                聊天已暂停。大纲在右侧（或下方）；要重开可从首页「历史对话」进入或开始新题。
              </div>
            )}
          </div>
        </div>

        <div className="min-h-[40vh] lg:min-h-0">
          {outlineMode ? (
            <CapsuleBoard
              topic={topic}
              capsules={capsules}
              onChange={setCapsules}
            />
          ) : (
            <div className="flex h-full min-h-[280px] items-center justify-center rounded-2xl border border-dashed border-stone-300 bg-stone-50/50 p-6 text-center text-sm text-stone-500 dark:border-stone-700 dark:bg-stone-900/30 dark:text-stone-400">
              多选编号并确认后，点「整理大纲」或说出「整理大纲」，这里会出现可拖动排序的胶囊。
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
