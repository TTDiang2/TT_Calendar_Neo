/**
 * 本地库装配期诊断日志（apps/mobile 侧同名工具的 packages/db 副本，避免反向依赖）。
 * console 与「主线程页面 #bootlog」双写；Worker realm（无 document）纯 console。
 * 这些日志只在 openLocalDb / SqlJsSqlite.open 的启动路径上打点，运行期为零开销。
 */
export function bootLog(...parts: unknown[]): void {
  const line = parts
    .map((p) => {
      if (typeof p === 'string') return p
      try {
        return JSON.stringify(p) ?? String(p)
      } catch {
        return String(p)
      }
    })
    .join(' ')
  console.log('[boot]', line)
  if (typeof document === 'undefined') return
  const el = document.getElementById('bootlog')
  if (!el) return
  const lines = (el.textContent ?? '').split('\n')
  lines.push(`[${new Date().toISOString().slice(11, 23)}] ${line}`)
  el.textContent = lines.slice(-40).join('\n')
}
