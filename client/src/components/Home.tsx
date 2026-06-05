import { useState } from 'react'
import type { FormEvent } from 'react'
import type { SessionListItem } from '../lib/sessionHistory'

export function Home({
  onStart,
  sessionSummaries,
  onOpenSession,
  onDeleteSession,
}: {
  onStart: (topic: string) => void
  sessionSummaries: SessionListItem[]
  onOpenSession: (id: string) => void
  onDeleteSession: (id: string) => void
}) {
  const [topic, setTopic] = useState('')
  const [historyOpen, setHistoryOpen] = useState(false)

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const t = topic.trim()
    if (!t) return
    onStart(t)
  }

  return (
    <div className="fixed inset-0 mx-auto flex w-full max-w-lg flex-col overflow-hidden bg-ta-bg text-ta-ink">
      {/* 上部约 2/3：鸭子欢迎区 */}
      <section className="relative flex min-h-0 flex-[2] flex-col overflow-hidden bg-ta-bg px-6 pt-6">
        <div className="relative z-20 shrink-0 font-bold leading-tight tracking-tight text-ta-green">
          <p className="text-lg sm:text-xl">Think Aloud 嘎嘎作文</p>
          <p className="text-[2.53125rem] sm:text-[2.8125rem]">聊一聊就有大纲</p>
        </div>

        <div className="relative z-0 flex min-h-0 flex-1 items-end justify-center px-1 pb-8 pt-2">
          {/* 气泡+鸭子作为一组居中，避免气泡被裁到屏外 */}
          <div className="flex max-w-full items-end gap-0.5 sm:gap-1">
            <div className="font-playful -translate-y-full mb-[34%] w-[10.5rem] shrink-0 rounded-2xl rounded-br-sm bg-ta-orange px-3.5 py-3 sm:w-[11.25rem]">
              <p className="text-sm font-medium leading-tight text-white/90">Hi 同学，</p>
              <p className="mt-1 text-lg font-bold leading-tight text-white sm:text-xl">
                作文搞得定~
              </p>
            </div>
            <img
              src="/duck-mascot.png"
              alt="加油鸭"
              className="h-auto max-h-[min(41vh,288px)] w-[min(62vw,280px)] max-w-full object-contain object-bottom"
            />
          </div>
        </div>

        {/* 波浪：奶油色过渡到同色系略深 */}
        <svg
          className="absolute -bottom-px left-0 w-full text-ta-muted"
          viewBox="0 0 400 48"
          preserveAspectRatio="none"
          aria-hidden
        >
          <path
            fill="currentColor"
            d="M0,32 C80,8 160,48 240,24 C320,0 360,16 400,28 L400,48 L0,48 Z"
          />
        </svg>
      </section>

      {/* 下部约 1/3：输入与主按钮 */}
      <section className="relative z-10 flex min-h-0 flex-1 flex-col bg-ta-muted px-6 pb-[max(1rem,env(safe-area-inset-bottom))] pt-6">
        <p className="shrink-0 text-center text-xl font-bold leading-snug text-ta-ink sm:text-2xl">
          你的作文题是啥？
        </p>

        <form onSubmit={handleSubmit} className="mt-5 flex min-h-0 flex-1 flex-col gap-3">
          <label htmlFor="topic-input" className="sr-only">
            今天的作文题
          </label>
          <textarea
            id="topic-input"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            rows={2}
            placeholder="例如：原来如此"
            className="w-full resize-none rounded-2xl border-2 border-ta-border bg-ta-surface px-4 py-3 text-base text-ta-ink placeholder:text-stone-400 transition focus:border-ta-green focus:bg-white focus:outline-none focus:ring-2 focus:ring-ta-green/25"
          />
          <button
            type="submit"
            disabled={!topic.trim()}
            className="font-playful min-h-[52px] w-full touch-manipulation rounded-full bg-ta-orange py-3.5 text-base font-bold text-white shadow-md shadow-ta-orange/25 transition hover:bg-ta-orange-hover active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-45"
          >
            开始构思
          </button>
        </form>

        <button
          type="button"
          onClick={() => setHistoryOpen(true)}
          className="mt-3 touch-manipulation text-center text-xs font-medium text-ta-green underline-offset-2 hover:underline"
        >
          历史对话
          {sessionSummaries.length > 0 ? `（${sessionSummaries.length}）` : ''}
        </button>
      </section>

      {/* 历史记录抽屉 */}
      {historyOpen ? (
        <div
          className="absolute inset-0 z-30 flex flex-col justify-end bg-ta-ink/30 backdrop-blur-[2px]"
          role="dialog"
          aria-modal="true"
          aria-labelledby="history-title"
        >
          <button
            type="button"
            className="min-h-0 flex-1"
            aria-label="关闭历史对话"
            onClick={() => setHistoryOpen(false)}
          />
          <div className="max-h-[70vh] rounded-t-3xl bg-ta-surface px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-5 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 id="history-title" className="text-lg font-semibold text-ta-ink">
                历史对话
              </h2>
              <button
                type="button"
                onClick={() => setHistoryOpen(false)}
                className="rounded-full px-3 py-1 text-sm text-ta-green hover:bg-ta-green-soft"
              >
                关闭
              </button>
            </div>
            <p className="mb-3 text-xs text-ta-ink-muted">保存在本机浏览器，可继续聊或查看大纲。</p>
            {sessionSummaries.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-ta-border bg-ta-bg px-4 py-8 text-center text-sm text-ta-ink-muted">
                暂无历史记录
              </p>
            ) : (
              <ul className="max-h-[50vh] space-y-2 overflow-y-auto pr-1">
                {sessionSummaries.map((s) => (
                  <li
                    key={s.id}
                    className="flex items-start gap-2 rounded-xl border border-ta-border bg-ta-bg px-3 py-2.5"
                  >
                    <button
                      type="button"
                      onClick={() => {
                        onOpenSession(s.id)
                        setHistoryOpen(false)
                      }}
                      className="min-w-0 flex-1 text-left"
                    >
                      <span className="line-clamp-2 text-sm font-medium text-ta-ink">{s.topic}</span>
                      <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-ta-ink-muted">
                        <time dateTime={new Date(s.updatedAt).toISOString()}>
                          {new Date(s.updatedAt).toLocaleString('zh-CN', {
                            month: 'numeric',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </time>
                        {s.hasOutline ? (
                          <span className="rounded-full bg-ta-green-soft px-2 py-px font-medium text-ta-green">
                            含·大纲
                          </span>
                        ) : null}
                        <span>{s.messageCount} 条消息</span>
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        if (confirm('删除这条历史记录？大纲与聊天都会删掉。')) onDeleteSession(s.id)
                      }}
                      className="shrink-0 rounded-lg px-2 py-1 text-[11px] text-rose-600 hover:bg-rose-50"
                      aria-label="删除"
                    >
                      删除
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : null}
    </div>
  )
}
