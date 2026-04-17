export type ChatRole = 'user' | 'assistant'

export type ChatMessage = { role: ChatRole; content: string }

export type ChatStage = 'opening' | 'diverge' | 'focus_prompt' | 'focus_confirm'

/** API 不接受空的 user/assistant 正文（否则会 400） */
function messagesForApi(messages: ChatMessage[]) {
  return messages.filter((m) => String(m.content ?? '').trim() !== '')
}

type SsePayload = {
  text?: string
  replace?: string
  done?: boolean
  suggest_converge?: boolean
  error?: string
}

function handleSsePayload(
  data: SsePayload,
  onDelta: (chunk: string) => void,
  onReplace: ((full: string) => void) | undefined,
  setSuggest: (v: boolean) => void,
) {
  if (data.error) throw new Error(data.error)
  if (data.text) onDelta(data.text)
  if (data.replace != null && onReplace) onReplace(data.replace)
  if (data.done) setSuggest(Boolean(data.suggest_converge))
}

const CHAT_STREAM_TIMEOUT_MS = 90_000

/** 流式聊天：边收边回调；结束时返回 suggest_converge */
export async function postChatStream(
  payload: {
    topic: string
    stage: ChatStage
    messages: ChatMessage[]
  },
  onDelta: (chunk: string) => void,
  onReplace?: (full: string) => void,
): Promise<{ suggest_converge: boolean }> {
  const controller = new AbortController()
  const timeoutId = window.setTimeout(() => controller.abort(), CHAT_STREAM_TIMEOUT_MS)
  let res: Response
  try {
    res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, messages: messagesForApi(payload.messages), stream: true }),
      signal: controller.signal,
    })
  } catch (e) {
    clearTimeout(timeoutId)
    if (e instanceof Error && e.name === 'AbortError') {
      throw new Error('等待回复超时，请检查网络或稍后重试。')
    }
    throw e
  }
  clearTimeout(timeoutId)
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error((data as { error?: string }).error || `请求失败 ${res.status}`)
  }
  if (!res.body) throw new Error('无响应体')

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let lineBuf = ''
  let suggest = false
  const setSuggest = (v: boolean) => {
    suggest = v
  }

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    lineBuf += decoder.decode(value, { stream: true })
    for (;;) {
      const i = lineBuf.indexOf('\n')
      if (i === -1) break
      const line = lineBuf.slice(0, i)
      lineBuf = lineBuf.slice(i + 1)
      if (!line.startsWith('data: ')) continue
      const raw = line.slice(6).trim()
      if (!raw || raw === '[DONE]') continue
      let data: SsePayload
      try {
        data = JSON.parse(raw) as SsePayload
      } catch {
        continue
      }
      handleSsePayload(data, onDelta, onReplace, setSuggest)
    }
  }

  const tail = lineBuf.trim()
  if (tail.startsWith('data: ')) {
    const raw = tail.slice(6).trim()
    if (raw && raw !== '[DONE]') {
      try {
        const data = JSON.parse(raw) as SsePayload
        handleSsePayload(data, onDelta, onReplace, setSuggest)
      } catch {
        /* ignore */
      }
    }
  }

  return { suggest_converge: suggest }
}

/** 非流式（兜底）：与流式共用服务端，不传 stream */
export async function postChat(payload: {
  topic: string
  stage: ChatStage
  messages: ChatMessage[]
}): Promise<{ reply: string; suggest_converge: boolean }> {
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...payload, messages: messagesForApi(payload.messages), stream: false }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error((data as { error?: string }).error || `请求失败 ${res.status}`)
  }
  return data as { reply: string; suggest_converge: boolean }
}

export type Capsule = {
  id: string
  text: string
  sourceSnippet: string
}

export async function postCapsules(payload: {
  topic: string
  messages: ChatMessage[]
  chosenFocus?: string
}): Promise<{ capsules: Capsule[] }> {
  const res = await fetch('/api/capsules', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...payload, messages: messagesForApi(payload.messages) }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error((data as { error?: string }).error || `请求失败 ${res.status}`)
  }
  return data as { capsules: Capsule[] }
}
