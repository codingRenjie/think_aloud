/**
 * 是否为「仅用编号多选写作重点」的回复；返回 false 时视为补充素材，应重新生成要点列表。
 */
export function looksLikeFocusSelection(text: string): boolean {
  const t = text.trim()
  if (!t || t.length > 48) return false
  if (!/\d/.test(t)) return false
  if (/[。！？；;：\n]/.test(t)) return false

  if (/[\u4e00-\u9fff]/.test(t)) {
    let u = t.replace(/\s+/g, '').trim()
    u = u.replace(/^[就那好行嗯哦唉呀哈的是的啊对呀对哦]+/u, '')
    u = u.replace(/^我(想|要)?(选|选一下|确定)?/u, '')
    u = u.replace(/^选/u, '')
    const compact = u.replace(/\s/g, '')
    if (
      compact.length > 0 &&
      compact.length <= 28 &&
      /^[\d、,，.·．和与及或要第号个点\-–—]+$/u.test(compact)
    ) {
      return true
    }
    return false
  }

  return /^[\d\s、,，.·．\-–—~～]+$/u.test(t)
}
