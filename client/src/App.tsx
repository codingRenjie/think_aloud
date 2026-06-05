import { useEffect, useState } from 'react'
import { Home } from './components/Home'
import { ChatSession } from './components/ChatSession'
import { OutlineSession } from './components/OutlineSession'
import {
  deleteSession,
  getSession,
  listSessionSummaries,
  type SavedChatSession,
} from './lib/sessionHistory'

type Route =
  | { kind: 'home' }
  | { kind: 'chat'; topic: string; sessionId: string; resume: SavedChatSession | null }
  | { kind: 'outline'; session: SavedChatSession }

/** 非 HTTPS（如 http://域名）下无 secure context，`crypto.randomUUID` 不可用，需回退 */
function newSessionId() {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `s-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`
}

export default function App() {
  const [route, setRoute] = useState<Route>({ kind: 'home' })
  const [, setListVersion] = useState(0)
  const refreshList = () => setListVersion((n) => n + 1)

  const summaries = route.kind === 'home' ? listSessionSummaries() : []

  useEffect(() => {
    window.scrollTo(0, 0)
    document.documentElement.scrollLeft = 0
    document.body.scrollLeft = 0
  }, [route])

  return (
    <>
      {route.kind === 'home' ? (
        <Home
          onStart={(topic) => {
            const t = topic.trim()
            if (!t) return
            setRoute({
              kind: 'chat',
              topic: t,
              sessionId: newSessionId(),
              resume: null,
            })
          }}
          sessionSummaries={summaries}
          onOpenSession={(id) => {
            const s = getSession(id)
            if (!s) {
              refreshList()
              return
            }
            if (s.outlineMode) {
              setRoute({ kind: 'outline', session: s })
            } else {
              setRoute({ kind: 'chat', topic: s.topic, sessionId: s.id, resume: s })
            }
          }}
          onDeleteSession={(id) => {
            deleteSession(id)
            refreshList()
          }}
        />
      ) : route.kind === 'chat' ? (
        <ChatSession
          sessionId={route.sessionId}
          topic={route.topic}
          resumeFrom={route.resume}
          onBack={() => {
            setRoute({ kind: 'home' })
            refreshList()
          }}
          onEnterOutline={(session) => {
            setRoute({ kind: 'outline', session })
            refreshList()
          }}
        />
      ) : (
        <OutlineSession
          session={route.session}
          onBack={() => {
            setRoute({ kind: 'home' })
            refreshList()
          }}
          onGoChat={(session) => {
            setRoute({
              kind: 'chat',
              topic: session.topic,
              sessionId: session.id,
              resume: session,
            })
          }}
        />
      )}
    </>
  )
}
