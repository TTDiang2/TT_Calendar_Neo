/**
 * 文本工具（移植自 tt_calendar/utils/text_utils.py）。
 * 纯字符串处理，不依赖 BeautifulSoup —— 浏览器/node 都要能跑。
 */

const HTML_TAG_RE = /<[^>]+>/g
const WS_RE = /\s+/

const NAMED_ENTITIES: Record<string, string> = {
  '&nbsp;': ' ',
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
}

function unescapeHtml(s: string): string {
  let out = s.replace(/&(?:nbsp|amp|lt|gt|quot|#39);/g, (m) => NAMED_ENTITIES[m] ?? m)
  out = out.replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
  return out
}

/**
 * HTML → 纯文本。
 *
 * ⚠️ 行为与 Python text_utils.py 逐字一致：<br> 先转 \n，但随后的空白折叠
 * （_WS_RE.sub(' ')）会把 \n 一并折叠成空格 —— 即最终结果**不保留换行**。
 * Python 版 docstring 声称"换行保留为 \n"，与其实际行为矛盾；此处以行为为准。
 */
export function htmlToPlain(html: string | null | undefined): string {
  if (!html) return ''
  const withNewlines = html.replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n')
  const text = withNewlines.replace(HTML_TAG_RE, '')
  return unescapeHtml(text).replace(WS_RE, ' ').trim()
}

/** 取第一行并截断 */
export function firstLine(text: string | null | undefined, maxLen = 40): string {
  if (!text) return ''
  const first = text.split('\n', 1)[0].trim()
  return first.length > maxLen ? first.slice(0, maxLen - 1) + '…' : first
}

/** 按长度截断加省略号 */
export function truncate(text: string | null | undefined, maxLen: number): string {
  if (!text) return ''
  return text.length <= maxLen ? text : text.slice(0, maxLen - 1) + '…'
}

/**
 * 把开头的【...】分离出来，返回 [括号内, 剩余]。
 * 例：'【下修股东会】山鹰转债' → ['下修股东会', '山鹰转债']
 */
export function stripBrackets(title: string | null | undefined): [string, string] {
  if (!title) return ['', '']
  const t = title.trim()
  if (t.startsWith('【')) {
    const end = t.indexOf('】')
    if (end > 0) return [t.slice(1, end), t.slice(end + 1).trim()]
  }
  return ['', t]
}

/** 从事件标题里提取【子动作】：'【申购日】天脉转债' → '申购日' */
export function subActionOf(title: string | null | undefined): string | null {
  const m = /^【(.+?)】/.exec(title ?? '')
  return m ? m[1] : null
}
