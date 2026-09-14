/**
 * 启动期诊断日志：console 双写；屏上 #bootlog 仅调试模式渲染。
 *
 * 默认只在 console 记录 —— 屏上那块黑底绿字日志条在正常使用中又丑又挡
 * 界面（2026-09-14 用户反馈移除）。两条重新显形的路：
 *   1. 手动：`localStorage.setItem('tt-bootlog','1')` 刷新页面；
 *   2. 自动：启动 8 秒内未调用 bootLogSettle()（= 卡死/未完成挂载，且真机上
 *      没法开 console）时自动显形——保住「一张截图回报卡点」的诊断能力。
 *
 * 若未来重新开启屏显：pointer-events-none 是硬要求——日志区悬浮在 UI 上，
 * 绝不能吞真机点击（否则验收动作本身会被污染，2026-09-13 智者审查 P0-1）。
 */

const BOOTLOG_FLAG = 'tt-bootlog'
const WATCHDOG_MS = 8000

let watchdog: ReturnType<typeof setTimeout> | null = null
let settled = false

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
  if (settled || document.getElementById('bootlog')) {
    if (debugFlagOn()) appendToScreen(line)
    return
  }
  if (debugFlagOn()) appendToScreen(line)
  // 看门狗：首条日志起 8s 未 settle（启动卡死）→ 自动显形，不用用户开 console
  if (!watchdog) {
    watchdog = setTimeout(() => {
      watchdog = null
      if (!settled) appendToScreen('[watchdog] boot not settled; showing bootlog')
    }, WATCHDOG_MS)
  }
}

/** 启动流程正常完成（React 已挂载）时调用：撤销看门狗，屏显回归纯手动开关 */
export function bootLogSettle(): void {
  settled = true
  if (watchdog) {
    clearTimeout(watchdog)
    watchdog = null
  }
}
