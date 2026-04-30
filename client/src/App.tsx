import { useState } from 'react'
import { Home } from './components/Home'
import { ChatSession } from './components/ChatSession'
import {
  deleteSession,
  getSession,
  listSessionSummaries,
  type SavedChatSession,
} from './lib/sessionHistory'

type Route =
  | { kind: 'home' }
  | { kind: 'chat'; topic: string; sessionId: string; resume: SavedChatSession | null }

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
            setRoute({ kind: 'chat', topic: s.topic, sessionId: s.id, resume: s })
          }}
          onDeleteSession={(id) => {
            deleteSession(id)
            refreshList()
          }}
        />
      ) : (
        <ChatSession
          sessionId={route.sessionId}
          topic={route.topic}
          resumeFrom={route.resume}
          onBack={() => {
            setRoute({ kind: 'home' })
            refreshList()
          }}
        />
      )}
    </>
  )
}
