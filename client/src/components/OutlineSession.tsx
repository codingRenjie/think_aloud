import { useEffect, useState } from 'react'
import type { Capsule } from '../lib/api'
import { upsertSession, type SavedChatSession } from '../lib/sessionHistory'
import { CapsuleBoard } from './CapsuleBoard'
import { SessionPhaseNav } from './SessionPhaseNav'

export function OutlineSession({
  session,
  onBack,
  onGoChat,
}: {
  session: SavedChatSession
  onBack: () => void
  onGoChat: (session: SavedChatSession) => void
}) {
  const [capsules, setCapsules] = useState<Capsule[]>(() =>
    session.capsules.map((c) => ({ ...c })),
  )

  function buildSession(): SavedChatSession {
    return {
      ...session,
      outlineMode: true,
      capsules,
      updatedAt: Date.now(),
    }
  }

  useEffect(() => {
    const t = window.setTimeout(() => {
      upsertSession(buildSession())
    }, 400)
    return () => clearTimeout(t)
  }, [session, capsules])

  function handleBack() {
    upsertSession(buildSession())
    onBack()
  }

  function handleGoChat() {
    const latest = buildSession()
    upsertSession(latest)
    onGoChat(latest)
  }

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
            大纲会保存在本机，下次可从首页继续
          </p>
        </div>
        <SessionPhaseNav
          active="outline"
          outlineAvailable
          onGoChat={handleGoChat}
          onGoOutline={() => {}}
        />
      </header>

      <div className="mx-auto min-h-0 w-full min-w-0 max-w-3xl flex-1 overflow-x-hidden overflow-y-auto overscroll-y-auto touch-pan-y p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:p-4">
        <CapsuleBoard topic={session.topic} capsules={capsules} onChange={setCapsules} />
      </div>
    </div>
  )
}
