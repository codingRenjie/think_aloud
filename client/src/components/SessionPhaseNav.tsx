/** 是否已成功生成过胶囊大纲（至少进入过一次大纲页） */
export function hasGeneratedOutline(session: {
  outlineMode: boolean
}): boolean {
  return session.outlineMode === true
}

export function SessionPhaseNav({
  active,
  outlineAvailable,
  onGoChat,
  onGoOutline,
}: {
  active: 'chat' | 'outline'
  outlineAvailable: boolean
  onGoChat: () => void
  onGoOutline: () => void
}) {
  const chatActive = active === 'chat'
  const outlineActive = active === 'outline'

  function tabClass(activeTab: boolean, enabled: boolean) {
    if (activeTab) {
      return 'bg-ta-surface font-semibold text-stone-800 shadow-sm'
    }
    if (!enabled) {
      return 'cursor-not-allowed text-stone-400 opacity-55'
    }
    return 'text-ta-ink-muted hover:text-stone-700 active:bg-ta-surface/60'
  }

  return (
    <nav
      className="flex max-w-[min(100%,11.5rem)] shrink-0 items-center gap-0.5 rounded-full border border-ta-border bg-ta-muted/70 p-0.5 text-[10px] shadow-sm sm:max-w-none sm:text-xs"
      aria-label="会话阶段"
    >
      <button
        type="button"
        onClick={onGoChat}
        disabled={chatActive}
        aria-current={chatActive ? 'page' : undefined}
        className={`touch-manipulation rounded-full px-2.5 py-1.5 transition sm:px-3 ${tabClass(chatActive, true)}`}
      >
        聊聊素材
      </button>
      <button
        type="button"
        onClick={onGoOutline}
        disabled={!outlineAvailable || outlineActive}
        aria-current={outlineActive ? 'page' : undefined}
        aria-disabled={!outlineAvailable}
        className={`touch-manipulation rounded-full px-2.5 py-1.5 transition sm:px-3 ${tabClass(outlineActive, outlineAvailable)}`}
      >
        整理大纲
      </button>
    </nav>
  )
}
