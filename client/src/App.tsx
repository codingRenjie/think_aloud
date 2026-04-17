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
              sessionId: crypto.randomUUID(),
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
