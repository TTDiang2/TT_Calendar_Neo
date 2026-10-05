/**
 * 教程状态存储（localStorage 持久化 + 订阅，照 i18n store 模式）。
 * 双标记（智者硬伤 A 的解）：
 *  - tt.onboarded-v1：新装用户走完「语言页→欢迎屏」才写；存量升级用户永远没有；
 *  - tt.tour-done-v1：教程完成/跳过。自动开教程 = 本次会话刚 onboarding 且 !tourDone。
 */
type Listener = () => void

const ONBOARDED_KEY = 'tt.onboarded-v1'
const TOUR_DONE_KEY = 'tt.tour-done-v1'

/** 会话级标记：onboarding 是否发生在本次会话（不持久化——重启不再自动开） */
let onboardedThisSession = false
const subs = new Set<Listener>()

function readKey(key: string): boolean {
  try {
    return localStorage.getItem(key) === '1'
  } catch {
    return false
  }
}

function writeKey(key: string, v: boolean): void {
  try {
    if (v) localStorage.setItem(key, '1')
    else localStorage.removeItem(key)
  } catch {
    /* 隐私模式等：只影响持久化 */
  }
  subs.forEach((fn) => fn())
}

export function hasOnboarded(): boolean {
  return readKey(ONBOARDED_KEY)
}

/** 欢迎屏两个按钮共用（「先随便看看」同时写 tourDone） */
export function completeOnboarding(skipTour: boolean): void {
  onboardedThisSession = true
  writeKey(ONBOARDED_KEY, true)
  if (skipTour) writeKey(TOUR_DONE_KEY, true)
}

export function isTourDone(): boolean {
  return readKey(TOUR_DONE_KEY)
}

export function completeTour(): void {
  writeKey(TOUR_DONE_KEY, true)
}

/** 自动开教程的充要条件（智者硬伤 A）：本次会话刚 onboarding 且未完成教程 */
export function shouldAutoStart(): boolean {
  return onboardedThisSession && !isTourDone()
}

/** 设置页「重看教程」用：清除完成标记并标记会话内可开（不写 onboarded——存量用户重看不改变其身份） */
export function requestRewatch(): void {
  onboardedThisSession = true
  writeKey(TOUR_DONE_KEY, false)
}

export function onTourStoreChange(fn: Listener): () => void {
  subs.add(fn)
  return () => subs.delete(fn)
}

/** 测试专用：重置全部状态 */
export function _resetTourStoreForTest(): void {
  onboardedThisSession = false
  try {
    localStorage.removeItem(ONBOARDED_KEY)
    localStorage.removeItem(TOUR_DONE_KEY)
  } catch {
    /* ignore */
  }
  subs.forEach((fn) => fn())
}
