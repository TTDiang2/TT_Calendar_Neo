/**
 * 启动期诊断日志：console 与屏上 #bootlog 双写。
 *
 * 真机上启动卡住/失败时，普通 console 用户看不到；把关键步骤同时写进页面
 * 固定角落的小字区，用户一张截图就能回报具体卡点。只服务启动诊断，
 * 不承载业务逻辑；Worker realm（无 document）自动降级为纯 console。
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
    el = document.createElement('pre')
    el.id = 'bootlog'
    el.className = 'fixed bottom-1 left-1 z-50 max-w-full overflow-auto whitespace-pre-wrap rounded bg-black/60 p-1 text-left text-[9px] leading-3 text-green-300'
    document.body.append(el)
  }
  const lines = (el.textContent ?? '').split('\n')
  lines.push(`[${new Date().toISOString().slice(11, 23)}] ${line}`)
  // 只留最后 40 行，避免长任务把日志区撑爆
  el.textContent = lines.slice(-40).join('\n')
}
