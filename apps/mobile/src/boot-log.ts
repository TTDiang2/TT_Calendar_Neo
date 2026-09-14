/**
 * 启动期诊断日志：console 常写；屏上 #bootlog 仅两种情况出现——
 *   1. 手动：`localStorage.setItem('tt-bootlog','1')` 刷新页面（调试开关）；
 *   2. 自动：启动日志开始后，若 15 秒内持续无新日志且未 bootLogSettle()
 *      （= 卡死，且真机没法开 console），看门狗自动显形——显形时把缓冲的
 *      最近日志整体回灌，一张截图就能看到「卡在哪一步」。
 * 正常启动完成（或卡死后恢复）时 bootLogSettle() 会撤掉看门狗显形的黑框；
 * 手动调试开关打开的黑框则保持常显。
 *
 * 若未来重新开启屏显：pointer-events-none 是硬要求——日志区悬浮在 UI 上，
 * 绝不能吞真机点击（否则验收动作本身会被污染，2026-09-13 智者审查 P0-1）。
 */

const BOOTLOG_FLAG = 'tt-bootlog'
const WATCHDOG_MS = 15000
const BUFFER_LINES = 10

let watchdog: ReturnType<typeof setTimeout> | null = null
let settled = false
let revealed = false            // 看门狗自动显形后置 true（此后日志照常上屏）
const recent: string[] = []     // 最近日志环形缓冲：显形时整体回灌

function debugFlagOn(): boolean {
  try {
    return localStorage.getItem(BOOTLOG_FLAG) === '1'
  } catch {
    return false
  }
}

function appendToScreen(line: string): void {
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

function armWatchdog(): void {
  if (watchdog) clearTimeout(watchdog)
  watchdog = setTimeout(() => {
    watchdog = null
    if (settled || revealed) return
    revealed = true
    // 头行 + 最近 9 条一次显形：屏上立刻能看到「卡在哪一步」
    // （appendToScreen 只留最后 10 行，所以头行之外最多回灌 9 条）
    appendToScreen('[watchdog] 启动已 15s 无进展，最近日志：')
    for (const l of recent.slice(-9)) appendToScreen(l)
  }, WATCHDOG_MS)
}

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
  recent.push(line)
  if (recent.length > BUFFER_LINES) recent.shift()
  // 屏显：手动调试开关（任何时刻，包括启动完成后），或看门狗已显形
  if (debugFlagOn() || revealed) appendToScreen(line)
  if (settled) return
  armWatchdog()
}

/** 启动流程正常完成（React 已挂载）时调用：撤销看门狗；若黑框是看门狗
 *  显出来的（非手动开关），一并移除——界面回归干净。 */
export function bootLogSettle(): void {
  settled = true
  if (watchdog) {
    clearTimeout(watchdog)
    watchdog = null
  }
  if (revealed && !debugFlagOn()) {
    document.getElementById('bootlog')?.remove()
    revealed = false
  }
}
