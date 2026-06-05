import { useEffect, useRef, useState } from 'react'
import { postChatStream, postCapsules, type ChatMessage } from '../lib/api'
import { upsertSession, type SavedChatSession } from '../lib/sessionHistory'
import { looksLikeFocusSelection } from '../lib/focusSelection'
import { stripLeadingSuggestMeta } from '../lib/stripSuggestMeta'
import { useSpeechRecognition } from '../hooks/useSpeechRecognition'

function PhaseBadge({
  focusChosen,
  awaitingFocusPick,
}: {
  focusChosen: boolean
  awaitingFocusPick: boolean
}) {
  let label = '发散聊聊'
  let sub = '想到什么说什么'
  if (awaitingFocusPick) {
    label = '梳理重点'
    sub = '可补充遗漏，或多选编号'
  } else if (focusChosen) {
    label = '准备大纲'
    sub = '点「整理大纲」或说出这四个字'
  }
  return (
    <div className="max-w-[min(100%,14rem)] shrink-0 rounded-full border border-ta-border bg-ta-surface px-2.5 py-1 text-left text-xs shadow-sm shadow-stone-200/50 sm:max-w-none sm:px-3">
      <span className="font-semibold text-stone-800">{label}</span>
      <span className="hidden text-ta-ink-muted sm:inline"> · {sub}</span>
    </div>
  )
}

export function ChatSession({
  topic,
  sessionId,
  resumeFrom,
  onBack,
  onEnterOutline,
}: {
  topic: string
  sessionId: string
  resumeFrom: SavedChatSession | null
  onBack: () => void
  onEnterOutline: (session: SavedChatSession) => void
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
  const [input, setInput] = useState('')

  const messagesScrollRef = useRef<HTMLDivElement>(null)
  /** 点「语音」那一刻输入框里已有的字，与 live 识别结果拼接展示 */
  const micPrefixRef = useRef('')

  function scrollMessagesToBottom(behavior: ScrollBehavior = 'smooth') {
    const el = messagesScrollRef.current
    if (!el) return
    el.scrollTo({ top: el.scrollHeight, behavior })
  }
  const { supported, listening, liveTranscript, listenOnce, cancel } = useSpeechRecognition()

  const displayInput =
    listening && supported ? `${micPrefixRef.current}${liveTranscript}` : input

  function buildSession(overrides: Partial<SavedChatSession> = {}): SavedChatSession {
    return {
      id: sessionId,
      topic,
      updatedAt: Date.now(),
      messages,
      suggestConverge,
      awaitingFocusPick,
      focusChosen,
      chosenFocus,
      outlineMode: false,
      capsules: [],
      ...overrides,
    }
  }

  useEffect(() => {
    const behavior: ScrollBehavior = messages.length <= 1 ? 'auto' : 'smooth'
    const id = requestAnimationFrame(() => {
      scrollMessagesToBottom(behavior)
    })
    return () => cancelAnimationFrame(id)
  }, [messages, loading])

  useEffect(() => {
    const payload = buildSession()
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
    upsertSession(buildSession())
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
      const session = buildSession({
        messages: hist,
        outlineMode: true,
        capsules: caps,
        updatedAt: Date.now(),
      })
      upsertSession(session)
      onEnterOutline(session)
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

  const showSuggestCta = suggestConverge && !awaitingFocusPick && !focusChosen
  const canManualFocus = userTurnCount >= 2 && !awaitingFocusPick && !focusChosen

  return (
    <div className="flex h-svh min-w-0 flex-col overflow-hidden bg-ta-bg text-ta-ink">
      <header className="sticky top-0 z-20 flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-ta-border bg-ta-bg/95 px-3 py-2.5 backdrop-blur sm:px-4 sm:py-3">
        <div className="min-w-0 text-left">
          <button
            type="button"
            onClick={handleBack}
            className="touch-manipulation rounded-xl px-2 py-1 text-sm font-medium text-stone-700 hover:bg-ta-muted"
          >
            ← 保存并返回
          </button>
          <p className="hidden px-2 text-[10px] leading-snug text-ta-ink-muted sm:block">
            对话会保存在本机，下次可从首页继续
          </p>
        </div>
        <PhaseBadge focusChosen={focusChosen} awaitingFocusPick={awaitingFocusPick} />
      </header>

      <div className="mx-auto flex min-h-0 w-full min-w-0 max-w-3xl flex-1 flex-col p-2 sm:p-4">
        <div className="flex min-h-0 flex-1 flex-col rounded-2xl border border-ta-border bg-ta-surface shadow-sm shadow-stone-200/50">
          <div className="shrink-0 border-b border-ta-border bg-ta-muted/40 px-3 py-2.5 text-left sm:px-4 sm:py-3">
            <p className="text-[10px] font-medium uppercase tracking-wider text-amber-700 sm:text-xs">
              题目
            </p>
            <p className="text-base font-semibold leading-snug text-stone-800 sm:text-lg">
              {topic}
            </p>
          </div>

          <div className="flex min-h-0 flex-1 flex-col">
            <div
              ref={messagesScrollRef}
              className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-4 py-4"
            >
              {error ? (
                <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p>
              ) : null}
              {messages.map((m, i) => (
                <div
                  key={`${i}-${m.content.slice(0, 12)}`}
                  className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[90%] break-words rounded-2xl px-3 py-2 text-sm leading-relaxed ${
                      m.role === 'user'
                        ? 'bg-ta-accent text-stone-900'
                        : 'border border-ta-border bg-ta-muted text-stone-800'
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
            </div>

            <div className="shrink-0 border-t border-ta-border bg-ta-surface p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
              {(showSuggestCta || canManualFocus || focusChosen) && (
                <div className="mb-3 flex flex-col gap-2">
                  {focusChosen ? (
                    <button
                      type="button"
                      onClick={() => void loadCapsules(messages)}
                      disabled={loading}
                      className="min-h-[44px] w-full touch-manipulation rounded-xl border-2 border-amber-400 bg-amber-50 py-2.5 text-sm font-bold text-amber-900 disabled:opacity-50"
                    >
                      {loading ? '正在生成大纲…' : '整理大纲'}
                    </button>
                  ) : showSuggestCta ? (
                    <button
                      type="button"
                      onClick={() => void triggerFocusPrompt()}
                      disabled={loading}
                      className="min-h-[44px] w-full touch-manipulation rounded-xl bg-amber-600 py-2.5 text-sm font-bold text-white shadow-sm shadow-amber-200/60 hover:bg-amber-500 disabled:opacity-50"
                    >
                      好，梳理重点
                    </button>
                  ) : canManualFocus ? (
                    <button
                      type="button"
                      onClick={() => void triggerFocusPrompt()}
                      disabled={loading}
                      className="min-h-[44px] w-full touch-manipulation rounded-xl border border-ta-border bg-ta-muted py-2.5 text-sm font-semibold text-stone-800 disabled:opacity-50"
                    >
                      聊够了，梳理重点
                    </button>
                  ) : null}
                </div>
              )}

              <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
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
                  className="min-h-[48px] w-full flex-1 resize-none rounded-xl border border-ta-border bg-ta-bg px-3 py-2.5 text-base text-stone-800 read-only:opacity-95 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/30 sm:text-sm"
                />
                <div className="flex shrink-0 gap-2 sm:w-auto">
                  {supported ? (
                    <button
                      type="button"
                      onClick={() => (listening ? cancel() : void onMic())}
                      className={`min-h-[44px] flex-1 touch-manipulation rounded-xl px-4 py-2.5 text-sm font-semibold sm:flex-none ${
                        listening ? 'bg-rose-500 text-white' : 'bg-ta-muted text-stone-800'
                      }`}
                    >
                      {listening ? '完成' : '语音'}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => void sendFromInput()}
                    disabled={loading || listening || !displayInput.trim()}
                    className="min-h-[44px] flex-1 touch-manipulation rounded-xl bg-ta-accent px-4 py-2.5 text-sm font-bold text-stone-900 hover:bg-ta-accent-hover disabled:opacity-40 sm:flex-none"
                  >
                    发送
                  </button>
                </div>
              </div>
              {supported ? (
                <p className="mt-1.5 hidden text-[10px] text-stone-400 sm:block">
                  说话时识别文字会同步出现在输入框；可连续说多句，点「完成」结束。
                </p>
              ) : (
                <p className="mt-1.5 text-[10px] text-stone-400">
                  当前浏览器不支持语音，可直接打字。
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
