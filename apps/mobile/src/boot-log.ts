/**
 * 启动期诊断日志：console 与屏上 #bootlog 双写。
 *
 * 真机上启动卡住/失败时，普通 console 用户看不到；把关键步骤同时写进页面
 * 固定角落的小字区，用户一张截图就能回报具体卡点。只服务启动诊断，
 * 不承载业务逻辑；Worker realm（无 document）自动降级为纯 console。
 *
 * pointer-events-none 是硬要求：日志区悬浮在 UI 上，绝不能吞真机点击
 * （否则验收动作本身会被污染，2026-09-13 智者审查 P0-1）。
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
    el.className =
      'pointer-events-none fixed bottom-1 left-1 z-50 max-w-full overflow-hidden whitespace-pre-wrap rounded bg-black/60 p-1 text-left text-[9px] leading-3 text-green-300'
    document.body.append(el)
  }
  const lines = (el.textContent ?? '').split('\n')
  lines.push(`[${new Date().toISOString().slice(11, 23)}] ${line}`)
  // 只留最后 10 行：够定位卡点即可，太长会在小屏上压住半个界面
  el.textContent = lines.slice(-10).join('\n')
}
