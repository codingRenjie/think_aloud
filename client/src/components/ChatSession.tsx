import { useEffect, useRef, useState } from 'react'
import { postChatStream, postCapsules, type ChatMessage, type Capsule } from '../lib/api'
import { upsertSession, type SavedChatSession } from '../lib/sessionHistory'
import { looksLikeFocusSelection } from '../lib/focusSelection'
import { stripLeadingSuggestMeta } from '../lib/stripSuggestMeta'
import { useSpeechRecognition } from '../hooks/useSpeechRecognition'
import { SessionPhaseNav } from './SessionPhaseNav'

type ChatPhase = 'diverge' | 'focus'

function getChatPhase(awaitingFocusPick: boolean, focusChosen: boolean): ChatPhase {
  if (awaitingFocusPick || focusChosen) return 'focus'
  return 'diverge'
}

/** 已展示重点列表、可进入大纲（含旧会话 focusChosen） */
function canOutlineFromChat(awaitingFocusPick: boolean, focusChosen: boolean): boolean {
  return awaitingFocusPick || focusChosen
}

const PHASE_STEPS = ['发散聊聊', '梳理重点', '整理大纲'] as const

function ChatPhaseGuide({ phase }: { phase: ChatPhase }) {
  const activeIndex = phase === 'diverge' ? 0 : phase === 'focus' ? 1 : 2
  return (
    <div
      className="flex items-center gap-1 border-b border-ta-border bg-ta-bg/60 px-3 py-2.5 sm:gap-1.5 sm:px-4"
      aria-label="聊天阶段"
    >
      {PHASE_STEPS.map((label, i) => {
        const done = i < activeIndex
        const current = i === activeIndex
        return (
          <div key={label} className="flex min-w-0 flex-1 items-center gap-1">
            {i > 0 ? (
              <span
                className={`hidden h-px flex-1 sm:block ${done ? 'bg-ta-green/50' : 'bg-ta-border'}`}
                aria-hidden
              />
            ) : null}
            <span
              className={`flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium sm:text-[11px] ${
                current
                  ? 'bg-ta-green-soft text-ta-green'
                  : done
                    ? 'text-ta-green'
                    : 'text-ta-ink-muted'
              }`}
            >
              <span
                className={`flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold tabular-nums ${
                  current
                    ? 'bg-ta-green text-white'
                    : done
                      ? 'bg-ta-green/15 text-ta-green'
                      : 'bg-ta-muted text-stone-400'
                }`}
              >
                {done ? '✓' : i + 1}
              </span>
              <span className="truncate">{label}</span>
            </span>
          </div>
        )
      })}
    </div>
  )
}

function phaseHint(
  phase: ChatPhase,
  showSuggestCta: boolean,
  canManualFocus: boolean,
  chosenFocus?: string,
): string | null {
  if (phase === 'focus') {
    if (chosenFocus) {
      return '已记下你选的要点；有遗漏可补充，够了就点「整理大纲」。'
    }
    return '看看上面的要点列表；有遗漏就补充，够了可以直接整理大纲。'
  }
  if (showSuggestCta) {
    return '伙伴觉得素材够丰富了，可以先梳理重点啦。'
  }
  if (canManualFocus) {
    return '想到什么就说什么；觉得聊够了，再梳理重点。'
  }
  return null
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
  const [focusChosen] = useState(() => resumeFrom?.focusChosen ?? false)
  const [chosenFocus, setChosenFocus] = useState<string | undefined>(() => resumeFrom?.chosenFocus)
  const [outlineGenerated, setOutlineGenerated] = useState(() => resumeFrom?.outlineMode ?? false)
  const [savedCapsules, setSavedCapsules] = useState<Capsule[]>(
    () => resumeFrom?.capsules?.map((c) => ({ ...c })) ?? [],
  )
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
      outlineMode: outlineGenerated,
      capsules: savedCapsules,
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
    outlineGenerated,
    savedCapsules,
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
    if (loading || awaitingFocusPick) return
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
      setOutlineGenerated(true)
      setSavedCapsules(caps.map((c) => ({ ...c })))
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
    const outlineReady = canOutlineFromChat(awaitingFocusPick, focusChosen)

    if (mentionsOutline && !outlineReady) {
      setError('请先梳理重点，再整理大纲哦。')
      return
    }

    const u: ChatMessage = { role: 'user', content: text }
    let hist = [...messages, u]
    setMessages(hist)

    if (mentionsOutline && outlineReady) {
      await loadCapsules(hist)
      return
    }

    if (awaitingFocusPick) {
      if (looksLikeFocusSelection(text)) {
        setChosenFocus(text)
        setError(null)
        return
      }

      setChosenFocus(undefined)
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
      } catch (e) {
        setError(e instanceof Error ? e.message : '更新重点列表失败')
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

  function goToOutline() {
    const session = buildSession({ updatedAt: Date.now() })
    upsertSession(session)
    onEnterOutline(session)
  }

  const outlineReady = canOutlineFromChat(awaitingFocusPick, focusChosen)
  const showSuggestCta = suggestConverge && !outlineReady
  const canManualFocus = userTurnCount >= 2 && !outlineReady
  const chatPhase = getChatPhase(awaitingFocusPick, focusChosen)
  const hint = phaseHint(chatPhase, showSuggestCta, canManualFocus, chosenFocus)

  const primaryCta = outlineReady
    ? {
        label: loading ? '正在生成大纲…' : '整理大纲',
        onClick: () => void loadCapsules(messages),
        style: 'outline' as const,
      }
    : showSuggestCta
      ? { label: '好，梳理重点', onClick: () => void triggerFocusPrompt(), style: 'primary' as const }
      : null

  const showManualFocusLink = canManualFocus && !showSuggestCta

  return (
    <div className="fixed inset-0 flex min-w-0 flex-col overflow-hidden bg-ta-bg text-ta-ink">
      <header className="z-20 flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-ta-border bg-ta-bg/95 px-3 py-2.5 backdrop-blur sm:flex-nowrap sm:px-4 sm:py-3">
        <div className="min-w-0 flex-1 text-left">
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
        <SessionPhaseNav
          active="chat"
          outlineAvailable={outlineGenerated}
          onGoChat={() => {}}
          onGoOutline={() => goToOutline()}
        />
      </header>

      <div className="mx-auto flex min-h-0 w-full min-w-0 max-w-3xl flex-1 flex-col overflow-x-hidden p-2 sm:p-4">
        <div className="flex min-h-0 flex-1 flex-col rounded-2xl border border-ta-border bg-ta-surface shadow-sm shadow-stone-200/50">
          <div className="shrink-0 border-b border-ta-border bg-ta-muted/40 px-3 py-2.5 text-left sm:px-4 sm:py-3">
            <p className="text-[10px] font-medium uppercase tracking-wider text-amber-700 sm:text-xs">
              题目
            </p>
            <p className="text-base font-semibold leading-snug text-stone-800 sm:text-lg">
              {topic}
            </p>
          </div>

          <ChatPhaseGuide phase={chatPhase} />

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
              {hint ? (
                <p className="mb-3 text-center text-xs leading-relaxed text-ta-ink-muted">{hint}</p>
              ) : null}

              {primaryCta ? (
                <button
                  type="button"
                  onClick={primaryCta.onClick}
                  disabled={loading}
                  className={`font-playful mb-3 min-h-[48px] w-full touch-manipulation rounded-full py-3 text-base font-bold disabled:cursor-not-allowed disabled:opacity-50 ${
                    primaryCta.style === 'outline'
                      ? 'bg-ta-orange text-white shadow-md shadow-ta-orange/25 hover:bg-ta-orange-hover'
                      : 'bg-ta-green text-white shadow-sm shadow-ta-green/20 hover:opacity-95'
                  }`}
                >
                  {primaryCta.label}
                </button>
              ) : null}

              {showManualFocusLink ? (
                <p className="mb-3 text-center text-xs text-ta-ink-muted">
                  觉得聊够了？{' '}
                  <button
                    type="button"
                    onClick={() => void triggerFocusPrompt()}
                    disabled={loading}
                    className="touch-manipulation font-medium text-ta-green underline-offset-2 hover:underline disabled:opacity-50"
                  >
                    梳理重点
                  </button>
                </p>
              ) : null}

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
                    outlineReady
                      ? '有遗漏就补充；也可以直接点「整理大纲」'
                      : '打字或先用语音…'
                  }
                  className="min-h-[48px] w-full flex-1 resize-none rounded-xl border border-ta-border bg-ta-bg px-3 py-2.5 text-base text-stone-800 read-only:opacity-95 focus:border-ta-green focus:outline-none focus:ring-2 focus:ring-ta-green/25 sm:text-sm"
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
                    className="min-h-[44px] flex-1 touch-manipulation rounded-full bg-ta-orange px-4 py-2.5 text-sm font-bold text-white hover:bg-ta-orange-hover disabled:opacity-40 sm:flex-none"
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
