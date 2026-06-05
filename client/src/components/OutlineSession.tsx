import { useEffect, useState } from 'react'
import type { Capsule } from '../lib/api'
import { upsertSession, type SavedChatSession } from '../lib/sessionHistory'
import { CapsuleBoard } from './CapsuleBoard'

export function OutlineSession({
  session,
  onBack,
}: {
  session: SavedChatSession
  onBack: () => void
}) {
  const [capsules, setCapsules] = useState<Capsule[]>(() =>
    session.capsules.map((c) => ({ ...c })),
  )

  useEffect(() => {
    const t = window.setTimeout(() => {
      upsertSession({
        ...session,
        outlineMode: true,
        capsules,
        updatedAt: Date.now(),
      })
    }, 400)
    return () => clearTimeout(t)
  }, [session, capsules])

  function handleBack() {
    upsertSession({
      ...session,
      outlineMode: true,
      capsules,
      updatedAt: Date.now(),
    })
    onBack()
  }

  return (
    <div className="flex h-svh min-w-0 flex-col overflow-hidden bg-ta-bg text-ta-ink">
      <header className="sticky top-0 z-20 flex shrink-0 items-center justify-between gap-2 border-b border-ta-border bg-ta-bg/95 px-3 py-2.5 backdrop-blur sm:px-4 sm:py-3">
        <div className="min-w-0 text-left">
          <button
            type="button"
            onClick={handleBack}
            className="touch-manipulation rounded-xl px-2 py-1 text-sm font-medium text-stone-700 hover:bg-ta-muted"
          >
            ← 保存并返回
          </button>
          <p className="hidden px-2 text-[10px] leading-snug text-ta-ink-muted sm:block">
            大纲会保存在本机，下次可从首页继续
          </p>
        </div>
        <div className="shrink-0 rounded-full border border-ta-border bg-ta-surface px-2.5 py-1 text-xs shadow-sm shadow-stone-200/50 sm:px-3">
          <span className="font-semibold text-stone-800">整理大纲</span>
          <span className="hidden text-ta-ink-muted sm:inline"> · 拖动胶囊排序</span>
        </div>
      </header>

      <div className="mx-auto min-h-0 w-full max-w-3xl flex-1 overflow-y-auto overscroll-y-contain touch-pan-y p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:p-4">
        <CapsuleBoard topic={session.topic} capsules={capsules} onChange={setCapsules} />
      </div>
    </div>
  )
}
