import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import dotenv from 'dotenv'
import express from 'express'
import cors from 'cors'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ENV_SERVER = path.join(__dirname, '.env')
const ENV_ROOT = path.join(__dirname, '..', '.env')
const ENV_CWD = path.join(process.cwd(), '.env')

/** 所有可能的 .env 路径（去重），兼容从仓库根或 server 目录启动、以及 cwd 不一致的情况 */
function collectEnvFilePaths() {
  const seen = new Set()
  const out = []
  const push = (p) => {
    try {
      const abs = path.resolve(p)
      if (seen.has(abs)) return
      seen.add(abs)
      out.push(abs)
    } catch {
      /* ignore */
    }
  }
  push(path.join(__dirname, '.env'))
  push(path.join(__dirname, '..', '.env'))
  push(path.join(process.cwd(), '.env'))
  push(path.join(process.cwd(), 'server', '.env'))
  return out
}

/**
 * 读取 .env。若某行值为空，不要用空字符串覆盖已存在的同名变量（避免示例里的 OPENAI_API_KEY= 冲掉真 key）。
 * 非空值会写入 process.env（可覆盖外层注入的空字符串）。
 */
function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return
  let raw = fs.readFileSync(filePath, 'utf8')
  if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1)
  raw = raw.replace(/\r\n/g, '\n')
  const parsed = dotenv.parse(raw)
  for (const [k, v] of Object.entries(parsed)) {
    const key = String(k).trim()
    const val = String(v ?? '').replace(/\r/g, '')
    const isEmpty = val.trim() === ''
    if (isEmpty) {
      if (process.env[key]) continue
      continue
    }
    process.env[key] = val
  }
}

function loadAllEnvFromDisk() {
  for (const p of collectEnvFilePaths()) {
    loadEnvFile(p)
  }
}

loadAllEnvFromDisk()

/**
 * Moonshot 文档里常用 MOONSHOT_API_KEY；本仓库示例用 OPENAI_API_KEY（兼容 OpenAI 系 SDK）。
 * 任填其一即可；会做 trim，并去掉首尾多余引号。
 */
function pickLlmApiKey() {
  loadAllEnvFromDisk()
  const names = [
    'OPENAI_API_KEY',
    'MOONSHOT_API_KEY',
    'KIMI_API_KEY',
    'MOONSHOT_KEY',
  ]
  for (const name of names) {
    const raw = process.env[name]
    if (raw == null || raw === '') continue
    const t = String(raw).trim().replace(/^['"]|['"]$/g, '')
    if (t) return t
  }
  return ''
}

const PORT = Number(process.env.PORT || 8787)
const BASE = (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '')

/** Moonshot 已于 2026-08-31 下线 moonshot-v1 / kimi-k2.5；旧 .env 仍可能写着这些名字 */
const SUNSET_MODELS = {
  'moonshot-v1-8k': 'kimi-k2.6',
  'moonshot-v1-32k': 'kimi-k2.6',
  'moonshot-v1-128k': 'kimi-k2.6',
  'moonshot-v1-auto': 'kimi-k2.6',
  'kimi-k2.5': 'kimi-k2.6',
}

function resolveChatModel(raw) {
  const requested = String(raw || 'kimi-k2.6').trim() || 'kimi-k2.6'
  const mapped = SUNSET_MODELS[requested]
  if (mapped) {
    console.warn(`[Think Aloud] 模型 ${requested} 已下线，改用 ${mapped}`)
    return mapped
  }
  return requested
}

const MODEL = resolveChatModel(process.env.OPENAI_MODEL)

/** kimi-k2.6 可关思考，避免短对话先空转「正在组织语言」 */
function llmRequestExtras() {
  if (/^kimi-k2\.6$/i.test(MODEL)) return { thinking: { type: 'disabled' } }
  return {}
}

function pickLlmMessageText(message) {
  if (!message || typeof message !== 'object') return ''
  const content = message.content
  if (typeof content === 'string' && content.trim()) return content
  const reasoning = message.reasoning_content
  if (typeof reasoning === 'string' && reasoning.trim()) return reasoning
  return ''
}

/** kimi-k2.6 / k3 等只允许 temperature=0.6；旧 moonshot-v1 曾要求 1 */
const IS_MOONSHOT_HOST = /moonshot\.(cn|ai)\b/i.test(BASE)
const LLM_TEMPERATURE = (() => {
  if (/^kimi-k(2\.6|2\.7|3)/i.test(MODEL)) return 0.6
  const raw = process.env.OPENAI_TEMPERATURE
  if (raw !== undefined && raw !== '') {
    const n = Number(raw)
    if (Number.isFinite(n)) return n
  }
  return IS_MOONSHOT_HOST ? 1 : 0.7
})()

/** 控制上下文长度与生成长度，显著影响延迟（尤其 kimi 长回复、长对话） */
const MAX_CHAT_MESSAGES = Math.min(200, Math.max(4, Number(process.env.MAX_CHAT_MESSAGES) || 20))
const MAX_TOKENS_CHAT = Math.min(4096, Math.max(96, Number(process.env.OPENAI_MAX_TOKENS) || 280))
const MAX_TOKENS_CAPSULES = Math.min(8192, Math.max(256, Number(process.env.OPENAI_MAX_TOKENS_CAPSULES) || 1200))
const CHAT_STREAM_ENABLED = !/^false$|^0$/i.test(String(process.env.OPENAI_CHAT_STREAM ?? ''))

if (!pickLlmApiKey()) {
  console.warn('[Think Aloud] 未读取到可用的 API Key。将依次检查下列路径：')
  for (const p of collectEnvFilePaths()) {
    console.warn(`  ${p} → ${fs.existsSync(p) ? '存在' : '不存在'}`)
  }
  console.warn(`  当前 process.cwd()：${process.cwd()}`)
  console.warn(
    '  请确认其中某一文件含有非空的 OPENAI_API_KEY 或 MOONSHOT_API_KEY；并结束旧的后端进程后重新 npm run dev。',
  )
} else {
  const which = ['OPENAI_API_KEY', 'MOONSHOT_API_KEY', 'KIMI_API_KEY', 'MOONSHOT_KEY'].find((n) => {
    const t = (process.env[n] || '').trim().replace(/^['"]|['"]$/g, '')
    return Boolean(t)
  })
  console.log(`[Think Aloud] 已读取 LLM 密钥（来源变量：${which || '未知'}）`)
  console.log(
    `[Think Aloud] 模型 ${MODEL}  ${BASE}  temperature=${LLM_TEMPERATURE}  history≤${MAX_CHAT_MESSAGES} 条消息 max_tokens=${MAX_TOKENS_CHAT} 流式=${CHAT_STREAM_ENABLED ? '开' : '关'}`,
  )
}

const MISSING_KEY_HINT =
  '未配置 API Key：在 server/.env 或项目根 .env 里设置 OPENAI_API_KEY 或 MOONSHOT_API_KEY（Moonshot 控制台常见为后者），保存后重启 npm run dev。'

const BASE_SYSTEM = `你是 Think Aloud，帮中小学生聊开作文题，不代写、不写作文提纲。回复≤3句口语短句；先接住感受再追问一个更小的、且与作文题有关的点。

【输出给孩子看的正文里禁止出现 JSON、禁止出现 suggest_converge、禁止出现英文键名。】机器用的状态请单独放在第1行（见下），不要和孩子的话写在同一行或混进正文。

输出协议（只给机器看的第一行，与孩子可读正文分开）：第1行仅 {"suggest_converge":true} 或 {"suggest_converge":false}，然后换行，空一行，再写给孩子的话。也可以用单行 JSON：{"reply":"仅含孩子可看的中文","suggest_converge":false}（reply 里绝不写 JSON）。`

const STAGE_EXTRA = {
  opening: `开场：紧扣【作文题】提1个开放小问题，不替孩子定选材。`,
  diverge: `发散阶段：你的工作是帮孩子把「一件事」聊具体，好写进【作文题】，不是当评论员下结论。
原则1｜启发与提问，不替孩子总结：少用「这说明你长大了」「你真棒」等泛泛定性收尾；避免一上来就归纳道理。孩子每给一条线索（哪怕只有半句），要用具体问题接住，帮他往下说。
原则2｜挖故事细节：引导孩子补充时间、地点、人物、事情经过（前因后果）、以及当时心里的想法或感受（怕什么、盼什么、后悔还是开心）。一次只追问一个小空档，不要像审问一样连珠炮。
原则3｜锚定作文题：细节都要能说不偏离——这件事里哪一点最贴题目要问的那个点？若略有跑题，先简短认可情绪，再问「这一点和题目里说的××有什么关系」。不要为热闹追问与写作无关的枝节（如无关的人名琐事、下一站去哪玩）。
仅当孩子已围绕【作文题】交出多段可用细节（时间/地点/人物/事件/心理至少有若干具体信息）时再 suggest_converge true。`,
  focus_prompt: `梳理重点（本段可突破上面「≤3句」限制，但只输出列表+短说明，不要长篇说教）：
1）快速通读从开场到目前的全部对话，紧扣【作文题】，只依据孩子说过的事实、感受与例子归纳，不编造新情节。
2）输出 4～8 条「可写进作文的要点」，每条单独一行，格式必须统一为「1. 」「2. 」…（数字+英文句点+空一格+短语），整体像对齐的编号列表，可读性优先。
3）列表后最多再用 1～2 句口语：提醒孩子若有遗漏可以补充，你会据补充更新列表；若没有遗漏，可以直接点「整理大纲」按钮。可选：若只想写其中几条，可以回复编号（如 1、3），不选也没关系。
suggest_converge 必 false。`,
  focus_confirm: `孩子刚用编号多选想写的要点（可能多个）。≤3 句口语：先简短认可，再明确说可以多选一起写；最后提醒孩子点「整理大纲」按钮或说出「整理大纲」来生成胶囊。不要重新列长清单。suggest_converge false。`,
}

function topicAnchorBlock(topic) {
  const t = String(topic).trim()
  return `【作文题】「${t}」
全程以题为锚：举例、追问、帮孩子展开故事时都要能说明「这段细节对写这道题有什么用」；不要为了「聊得热闹」把孩子带离写作任务。`
}

function trimChatMessages(msgs) {
  if (!Array.isArray(msgs) || msgs.length <= MAX_CHAT_MESSAGES) return msgs
  return msgs.slice(-MAX_CHAT_MESSAGES)
}

/** Moonshot/OpenAI 不允许 content 为空的 assistant/user 出现在历史里 */
function sanitizeMessagesForLlm(msgs) {
  if (!Array.isArray(msgs)) return []
  return msgs.filter(
    (m) =>
      m &&
      (m.role === 'user' || m.role === 'assistant') &&
      String(m.content ?? '').trim() !== '',
  )
}

const LEADING_SUGGEST_RE =
  /^\s*\{\s*["']?suggest_converge["']?\s*:\s*(true|false)\s*\}\s*/i

/** 去掉误贴在孩子正文前的 JSON 元数据（含与首句汉字粘在同一行的情况） */
function stripLeadingSuggestMeta(s) {
  let out = String(s ?? '')
  let prev
  do {
    prev = out
    out = out.replace(LEADING_SUGGEST_RE, '').trimStart()
  } while (out !== prev)
  return out
}

function parseLeadingSuggestBoolean(text) {
  const m = String(text).match(LEADING_SUGGEST_RE)
  if (!m) return undefined
  return m[1].toLowerCase() === 'true'
}

function parseChatModelOutput(raw) {
  const t = String(raw).trim()
  try {
    const j = JSON.parse(t)
    if (j && typeof j === 'object' && 'reply' in j) {
      return {
        reply: stripLeadingSuggestMeta(String(j.reply || '').trim()),
        suggest_converge: Boolean(j.suggest_converge),
      }
    }
  } catch {
    /* 两行格式或纯文本 */
  }
  const nl = t.indexOf('\n')
  if (nl === -1) {
    const gluedSuggest = parseLeadingSuggestBoolean(t)
    const body = stripLeadingSuggestMeta(t)
    if (gluedSuggest !== undefined) {
      return { reply: body, suggest_converge: gluedSuggest }
    }
    return { reply: body, suggest_converge: false }
  }
  const head = t.slice(0, nl).trim()
  let suggest = false
  try {
    suggest = Boolean(JSON.parse(head).suggest_converge)
  } catch {
    const g = parseLeadingSuggestBoolean(head)
    if (g !== undefined) suggest = g
  }
  let reply = t
    .slice(nl + 1)
    .replace(/^\s*\n+/, '')
    .trim()
  reply = stripLeadingSuggestMeta(reply)
  return { reply, suggest_converge: suggest }
}

async function chatCompletionSync({ system, messages }) {
  const key = pickLlmApiKey()
  if (!key) throw new Error(MISSING_KEY_HINT)
  const body = {
    model: MODEL,
    temperature: LLM_TEMPERATURE,
    max_tokens: MAX_TOKENS_CHAT,
    ...llmRequestExtras(),
    messages: [
      { role: 'system', content: system },
      ...messages.map((m) => ({ role: m.role, content: m.content })),
    ],
  }
  const res = await fetch(`${BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const t = await res.text()
    throw new Error(`OpenAI HTTP ${res.status}: ${t.slice(0, 500)}`)
  }
  const data = await res.json()
  const raw = pickLlmMessageText(data.choices?.[0]?.message)
  if (!raw) throw new Error('OpenAI 空响应')
  return parseChatModelOutput(raw)
}

async function jsonObjectCompletion({ system, userContent, maxTokens }) {
  const key = pickLlmApiKey()
  if (!key) throw new Error(MISSING_KEY_HINT)
  const body = {
    model: MODEL,
    temperature: LLM_TEMPERATURE,
    max_tokens: maxTokens,
    response_format: { type: 'json_object' },
    ...llmRequestExtras(),
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: userContent },
    ],
  }
  const res = await fetch(`${BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const t = await res.text()
    throw new Error(`OpenAI HTTP ${res.status}: ${t.slice(0, 500)}`)
  }
  const data = await res.json()
  const raw = pickLlmMessageText(data.choices?.[0]?.message)
  if (!raw) throw new Error('OpenAI 空响应')
  return JSON.parse(raw)
}

/** 仅取增量 delta，不要把 message.content（常为全文）掺进来，否则会重复拼接、越聊越卡 */
function extractOpenAiStreamDeltaIncremental(choice) {
  if (!choice || typeof choice !== 'object') return ''
  const d = choice.delta
  if (!d || typeof d !== 'object') return ''
  const c = d.content
  if (typeof c === 'string' && c.length) return c
  if (Array.isArray(c)) {
    let s = ''
    for (const part of c) {
      if (typeof part === 'string') s += part
      else if (part && typeof part === 'object') {
        if (typeof part.text === 'string') s += part.text
        else if (typeof part.content === 'string') s += part.content
      }
    }
    return s
  }
  return ''
}

/** SSE：首 token 更早到达，正文边生成边下发 */
function shouldClampReplyStage(stage) {
  return stage !== 'focus_prompt'
}

async function streamChatToResponse({ system, messages, res, stage = 'diverge' }) {
  const key = pickLlmApiKey()
  if (!key) throw new Error(MISSING_KEY_HINT)
  const body = {
    model: MODEL,
    temperature: LLM_TEMPERATURE,
    max_tokens: MAX_TOKENS_CHAT,
    stream: true,
    ...llmRequestExtras(),
    messages: [
      { role: 'system', content: system },
      ...messages.map((m) => ({ role: m.role, content: m.content })),
    ],
  }
  const upstream = await fetch(`${BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  if (!upstream.ok) {
    const t = await upstream.text()
    throw new Error(`OpenAI HTTP ${upstream.status}: ${t.slice(0, 500)}`)
  }
  if (!upstream.body) throw new Error('上游无 stream 响应体')

  const reader = upstream.body.getReader()
  const decoder = new TextDecoder()
  let sseCarry = ''
  let firstLineBuf = ''
  let phase = 'firstline'
  let suggest_converge = false
  let replyTotal = ''
  /** 若首行协议未命中，用于兜底整段解析 */
  let rawStreamFallback = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    sseCarry += decoder.decode(value, { stream: true })
    while (true) {
      const idx = sseCarry.indexOf('\n')
      if (idx === -1) break
      const line = sseCarry.slice(0, idx)
      sseCarry = sseCarry.slice(idx + 1)
      if (!line.startsWith('data: ')) continue
      const payload = line.slice(6).trim()
      if (payload === '' || payload === '[DONE]') continue
      let j
      try {
        j = JSON.parse(payload)
      } catch {
        continue
      }
      const choice = j.choices?.[0]
      const inc = extractOpenAiStreamDeltaIncremental(choice)
      if (inc) {
        rawStreamFallback += inc
        if (phase === 'firstline') {
          firstLineBuf += inc
          const nl = firstLineBuf.indexOf('\n')
          if (nl !== -1) {
            const head = firstLineBuf.slice(0, nl).trim()
            try {
              suggest_converge = Boolean(JSON.parse(head).suggest_converge)
            } catch {
              suggest_converge = false
            }
            let rest = firstLineBuf.slice(nl + 1)
            firstLineBuf = ''
            rest = rest.replace(/^\s*\n+/, '')
            phase = 'reply'
            if (rest) {
              replyTotal += rest
              res.write(`data: ${JSON.stringify({ text: rest })}\n\n`)
            }
          }
        } else {
          replyTotal += inc
          res.write(`data: ${JSON.stringify({ text: inc })}\n\n`)
        }
      }
      /** 结束帧常带全文 message.content：用解析结果覆盖，避免与增量重复拼接 */
      if (
        choice?.finish_reason &&
        choice.message &&
        typeof choice.message.content === 'string' &&
        choice.message.content.length > 0
      ) {
        const full = choice.message.content
        if (full.trim()) {
          rawStreamFallback = full
          const pvo = parseChatModelOutput(full)
          if (pvo.reply.trim()) {
            replyTotal = pvo.reply
            suggest_converge = pvo.suggest_converge
            phase = 'reply'
            res.write(`data: ${JSON.stringify({ replace: replyTotal })}\n\n`)
          }
        }
      }
    }
  }

  if (phase === 'firstline' && firstLineBuf.trim()) {
    const pvo = parseChatModelOutput(firstLineBuf)
    suggest_converge = pvo.suggest_converge
    replyTotal = pvo.reply
    if (replyTotal) res.write(`data: ${JSON.stringify({ replace: replyTotal })}\n\n`)
  }

  if (!String(replyTotal).trim() && rawStreamFallback.trim()) {
    const pvo = parseChatModelOutput(rawStreamFallback)
    suggest_converge = pvo.suggest_converge
    replyTotal = pvo.reply
    if (replyTotal) res.write(`data: ${JSON.stringify({ replace: replyTotal })}\n\n`)
  }

  replyTotal = stripLeadingSuggestMeta(replyTotal)
  if (shouldClampReplyStage(stage)) {
    const clamped = clampSentences(replyTotal, 3)
    if (clamped !== replyTotal) {
      res.write(`data: ${JSON.stringify({ replace: clamped })}\n\n`)
    }
  }
  res.write(`data: ${JSON.stringify({ done: true, suggest_converge })}\n\n`)
}

function clampSentences(text, max = 3) {
  if (!text) return ''
  const sents = text
    .split(/(?<=[。！？!?])/u)
    .map((s) => s.trim())
    .filter(Boolean)
  if (sents.length === 0) return text.slice(0, 120) + (text.length > 120 ? '…' : '')
  if (sents.length <= max) return sents.join('')
  return sents.slice(0, max).join('')
}

const app = express()
app.use(cors({ origin: true }))
app.use(express.json({ limit: '1mb' }))

app.post('/api/chat', async (req, res) => {
  try {
    const { topic, stage, messages = [], stream: wantStream } = req.body || {}
    if (!topic || typeof topic !== 'string') {
      return res.status(400).json({ error: '缺少 topic' })
    }
    const st = STAGE_EXTRA[stage] ? stage : 'diverge'
    const system = `${BASE_SYSTEM}\n\n${topicAnchorBlock(topic)}\n\n${STAGE_EXTRA[st]}`

    let apiMessages = trimChatMessages(sanitizeMessagesForLlm([...messages]))
    if (st === 'opening') {
      apiMessages = [
        {
          role: 'user',
          content: `作文题目是：「${topic.trim()}」。请开始对孩子说第一段话（开场白）。`,
        },
      ]
    }

    const wantSse = Boolean(wantStream)

    if (wantSse) {
      res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
      res.setHeader('Cache-Control', 'no-cache')
      res.setHeader('Connection', 'keep-alive')
      res.setHeader('X-Accel-Buffering', 'no')
      res.flushHeaders?.()
      try {
        if (CHAT_STREAM_ENABLED) {
          await streamChatToResponse({ system, messages: apiMessages, res, stage: st })
        } else {
          const parsed = await chatCompletionSync({ system, messages: apiMessages })
          let reply = stripLeadingSuggestMeta(String(parsed.reply || '').trim())
          if (shouldClampReplyStage(st)) reply = clampSentences(reply, 3)
          const suggest = Boolean(parsed.suggest_converge)
          res.write(`data: ${JSON.stringify({ replace: reply })}\n\n`)
          res.write(`data: ${JSON.stringify({ done: true, suggest_converge: suggest })}\n\n`)
        }
      } catch (err) {
        res.write(`data: ${JSON.stringify({ error: err.message || 'stream 错误' })}\n\n`)
        res.write(`data: ${JSON.stringify({ done: true, suggest_converge: false })}\n\n`)
      }
      res.end()
      return
    }

    const parsed = await chatCompletionSync({ system, messages: apiMessages })
    let reply = stripLeadingSuggestMeta(String(parsed.reply || '').trim())
    if (shouldClampReplyStage(st)) reply = clampSentences(reply, 3)
    const suggest_converge = Boolean(parsed.suggest_converge)
    res.json({ reply, suggest_converge })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: e.message || '服务器错误' })
  }
})

app.post('/api/capsules', async (req, res) => {
  try {
    const { topic, messages = [], chosenFocus } = req.body || {}
    if (!pickLlmApiKey()) {
      return res.status(500).json({ error: MISSING_KEY_HINT })
    }
    const transcript = trimChatMessages(
      sanitizeMessagesForLlm(messages.filter((m) => m.role === 'user' || m.role === 'assistant')),
    )
      .map((m) => `${m.role === 'user' ? '孩子' : '伙伴'}：${m.content}`)
      .join('\n')

    const system = `从对话里为孩子生成「作文素材胶囊」标签：只用孩子说过的事实、例子、感受；可以用略短的中文短语归纳，但不要编造新情节。
输出 JSON：{ "capsules": [ { "text": "短标签（≤20字）", "source_snippet": "必须从下面转录中复制一段孩子原话作为依据" } ] }
数量 4～12 个。不要输出提纲句式（禁止出现「第一段」）。`

    const user = `题目：「${String(topic)}」
${chosenFocus ? `孩子想写的重点（可能多选编号）：${chosenFocus}\n` : ''}
对话转录：
${transcript}`

    const raw = await jsonObjectCompletion({
      system,
      userContent: user,
      maxTokens: MAX_TOKENS_CAPSULES,
    })
    const list = Array.isArray(raw.capsules) ? raw.capsules : []
    const capsules = list
      .filter((c) => c && typeof c.text === 'string')
      .map((c, i) => ({
        id: `c${i}-${Date.now()}`,
        text: String(c.text).trim().slice(0, 40),
        sourceSnippet: String(c.source_snippet || c.sourceSnippet || '').trim(),
      }))
      .filter((c) => c.text)

    res.json({ capsules })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: e.message || '服务器错误' })
  }
})

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, hasKey: Boolean(pickLlmApiKey()) })
})

/** 生产环境：托管 Vite 构建产物，便于单进程部署（PaaS / VPS） */
const clientDist = path.join(__dirname, '..', 'client', 'dist')
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist))
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next()
    res.sendFile(path.join(clientDist, 'index.html'))
  })
}

const server = app.listen(PORT, () => {
  console.log(`Think Aloud server http://localhost:${PORT}`)
})
server.on('error', (err) => {
  if (err && err.code === 'EADDRINUSE') {
    console.error(
      `[Think Aloud] 端口 ${PORT} 已被占用（常见于上一次终端里的服务没关干净）。\n` +
        `可先结束进程：kill $(lsof -t -i:${PORT})\n` +
        `再重新在项目根目录执行：npm run dev\n` +
        `或换端口：在 server/.env 设置 PORT=其它端口，并同步修改 client/vite.config.ts 里 proxy target。`,
    )
  } else {
    console.error(err)
  }
  process.exit(1)
})
