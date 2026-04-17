import type { Capsule, ChatMessage } from './api'

const STORAGE_KEY = 'think-aloud-sessions-v1'
const MAX_SESSIONS = 48

export type SavedChatSession = {
  id: string
  topic: string
  updatedAt: number
  messages: ChatMessage[]
  suggestConverge: boolean
  awaitingFocusPick: boolean
  focusChosen: boolean
  chosenFocus?: string
  outlineMode: boolean
  capsules: Capsule[]
}

type StoreV1 = { v: 1; items: SavedChatSession[] }

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null
}

function isValidSession(x: unknown): x is SavedChatSession {
  if (!isRecord(x)) return false
  if (typeof x.id !== 'string' || typeof x.topic !== 'string') return false
  if (typeof x.updatedAt !== 'number') return false
  if (!Array.isArray(x.messages)) return false
  return true
}

function readStore(): StoreV1 {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { v: 1, items: [] }
    const j = JSON.parse(raw) as unknown
    if (!isRecord(j) || j.v !== 1 || !Array.isArray(j.items)) return { v: 1, items: [] }
    return { v: 1, items: j.items.filter(isValidSession) }
  } catch {
    return { v: 1, items: [] }
  }
}

function writeStore(items: SavedChatSession[]) {
  const trimmed = [...items]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, MAX_SESSIONS)
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ v: 1, items: trimmed }))
}

/** 列表展示用 */
export type SessionListItem = {
  id: string
  topic: string
  updatedAt: number
  hasOutline: boolean
  messageCount: number
}

export function listSessionSummaries(): SessionListItem[] {
  const { items } = readStore()
  return items
    .filter((s) =>
      s.messages.some((m) => String(m.content ?? '').trim() !== ''),
    )
    .map((s) => ({
      id: s.id,
      topic: s.topic,
      updatedAt: s.updatedAt,
      hasOutline: Boolean(s.outlineMode),
      messageCount: s.messages?.length ?? 0,
    }))
    .sort((a, b) => b.updatedAt - a.updatedAt)
}

export function getSession(id: string): SavedChatSession | null {
  const { items } = readStore()
  const s = items.find((i) => i.id === id)
  return s ? { ...s, messages: [...s.messages], capsules: [...s.capsules] } : null
}

export function upsertSession(session: SavedChatSession): void {
  const { items } = readStore()
  const next = items.filter((i) => i.id !== session.id)
  next.push({ ...session, updatedAt: session.updatedAt || Date.now() })
  writeStore(next)
}

export function deleteSession(id: string): void {
  const { items } = readStore()
  writeStore(items.filter((i) => i.id !== id))
}
