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

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const t = topic.trim()
    if (!t) return
    onStart(t)
  }

  return (
    <div className="relative min-h-svh overflow-hidden bg-[#1c1917] text-stone-100">
      <div
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          background:
            'radial-gradient(ellipse 80% 60% at 20% 20%, #f59e0b 0%, transparent 50%), radial-gradient(ellipse 60% 50% at 85% 70%, #78716c 0%, transparent 45%)',
        }}
      />
      <div className="relative mx-auto flex min-h-svh max-w-lg flex-col justify-center px-6 py-16">
        <p className="font-display text-sm font-medium tracking-wide text-amber-200/90">
          Think Aloud
        </p>
        <h1 className="mt-2 font-display text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">
          聊出想法，
          <br />
          排成大纲
        </h1>
        <p className="mt-4 text-sm leading-relaxed text-stone-300">
          跟小伙伴随便聊聊作文题，把脑子里的碎片说出来；不代写作文，只帮你把素材收成能拖动的小胶囊。
        </p>

        <form onSubmit={handleSubmit} className="mt-10 space-y-4">
          <label className="block text-left text-xs font-medium uppercase tracking-wider text-stone-400">
            今天的作文题
          </label>
          <textarea
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            rows={3}
            placeholder="例如：原来如此"
            className="w-full resize-none rounded-2xl border border-stone-600 bg-stone-900/80 px-4 py-3 text-base text-stone-100 placeholder:text-stone-500 focus:border-amber-500/70 focus:outline-none focus:ring-1 focus:ring-amber-500/50"
          />
          <button
            type="submit"
            className="w-full rounded-2xl bg-amber-500 py-3.5 text-sm font-semibold text-stone-900 transition hover:bg-amber-400 active:scale-[0.99]"
          >
            开始构思
          </button>
        </form>
        <p className="mt-8 text-center text-[11px] text-stone-500">
          语音在部分浏览器／手机上更稳定；也可以打字。需要配置 API Key 才能聊天。
        </p>

        <div className="mt-12 border-t border-stone-700/80 pt-8 text-left">
          <h2 className="font-display text-sm font-semibold text-stone-200">历史对话</h2>
          <p className="mt-1 text-[11px] text-stone-500">
            保存在本机浏览器，可继续编辑或查看大纲。若无记录，请先聊几句并点左上角「结束」保存。
          </p>
          {sessionSummaries.length === 0 ? (
            <p className="mt-4 rounded-xl border border-dashed border-stone-600/70 bg-stone-900/30 px-3 py-4 text-center text-xs text-stone-500">
              暂无历史记录
            </p>
          ) : (
            <ul className="mt-4 max-h-[min(40vh,320px)] space-y-2 overflow-y-auto pr-1">
              {sessionSummaries.map((s) => (
                <li
                  key={s.id}
                  className="flex items-start gap-2 rounded-xl border border-stone-700/60 bg-stone-900/50 px-3 py-2.5"
                >
                  <button
                    type="button"
                    onClick={() => onOpenSession(s.id)}
                    className="min-w-0 flex-1 text-left transition hover:opacity-90"
                  >
                    <span className="line-clamp-2 text-sm font-medium text-stone-100">{s.topic}</span>
                    <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-stone-500">
                      <time dateTime={new Date(s.updatedAt).toISOString()}>
                        {new Date(s.updatedAt).toLocaleString('zh-CN', {
                          month: 'numeric',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </time>
                      {s.hasOutline ? (
                        <span className="rounded bg-amber-500/20 px-1.5 py-px text-amber-200/90">
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
                    className="shrink-0 rounded-lg px-2 py-1 text-[11px] text-rose-400/90 hover:bg-rose-950/50"
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
    </div>
  )
}
