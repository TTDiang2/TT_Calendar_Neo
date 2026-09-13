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
  let el = document.getElementById('bootlog')
  if (!el) {
    // 与 apps/mobile 侧 boot-log 同款样式；主线程回退场景下本文件可能先于
    // 应用侧创建该元素，样式必须保持一致（不吞点击、不遮挡半屏）
    el = document.createElement('pre')
    el.id = 'bootlog'
    el.className =
      'pointer-events-none fixed bottom-1 left-1 z-50 max-w-full overflow-hidden whitespace-pre-wrap rounded bg-black/60 p-1 text-left text-[9px] leading-3 text-green-300'
    document.body.append(el)
  }
  const lines = (el.textContent ?? '').split('\n')
  lines.push(`[${new Date().toISOString().slice(11, 23)}] ${line}`)
  el.textContent = lines.slice(-10).join('\n')
}
