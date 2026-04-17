/** 去掉模型误输出到正文里的 suggest 元数据，避免孩子都看到 JSON */
const LEADING_SUGGEST_RE =
  /^\s*\{\s*["']?suggest_converge["']?\s*:\s*(true|false)\s*\}\s*/i

export function stripLeadingSuggestMeta(s: string): string {
  let out = String(s ?? '')
  let prev: string
  do {
    prev = out
    out = out.replace(LEADING_SUGGEST_RE, '').trimStart()
  } while (out !== prev)
  return out
}
