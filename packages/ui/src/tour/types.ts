/**
 * 新手教程类型契约（20261005 智者定稿）。
 *
 * 核心纪律：
 *  - before = **幂等的绝对状态断言**（api.goTab('todo')，禁止 toggle/相对操作）——
 *    引擎在每次进入该步时执行（含后退、含重看），“从任意状态归位”由它自然保证；
 *  - 步骤文件不 import 任何 context——before(api) 由引擎运行时注入；
 *  - platform 过滤按“进入该步时”的 useIsMobile 求值。
 */
import type { TxKey } from '../i18n/keys'

/** 教程可驱动的 App 能力子集（由 AppInner 用 useMemo 组装，单一事实来源=同一组 setter） */
export interface TourApi {
  /** 集中式归位：关全部弹层 + 回日历月视图（智者硬伤 C 的解） */
  resetToHome(): void
  goTab(tab: 'calendar' | 'todo' | 'stats' | 'widgets'): void
  setMode(mode: 'month' | 'week' | 'day' | 'year' | 'countdown'): void
  setTodoView(view: 'list' | 'matrix' | 'kanban' | 'gantt' | 'stickies'): void
  openLayers(): void
  closeLayers(): void
  openRight(): void
  closeRight(): void
  openSettings(): void
  closeDialog(): void
  /** 引擎 start() 时调用（重看场景保护用户当前视图偏好；首看时为默认态无感） */
  snapshot?(): void
  /** 引擎结束（完成/跳过）时调用：恢复快照（含 todo-view 持久化值的还原） */
  restore?(): void
}

export type TourPlatform = 'mobile' | 'desktop'

/** 教程步骤定义（数据化；steps.ts 是唯一实例来源） */
export interface TourStep {
  id: string
  /** data-tour 选择器值；无 target = 居中大卡（欢迎/结束） */
  target?: string
  /** popover 期望方位；空间不足自动翻转，再不足降级底部 sheet（placement.ts 纯函数） */
  placement?: 'top' | 'bottom' | 'left' | 'right'
  /** 进入该步时执行（幂等绝对断言；引擎对前进/后退/重放都会执行） */
  before?: (api: TourApi) => void
  /** 离开该步时执行（恢复性动作，如关抽屉） */
  after?: (api: TourApi) => void
  titleKey: TxKey
  bodyKey: TxKey
  /** 只在对应平台出现；缺省 = 两端都有 */
  platform?: TourPlatform
  /** hands-on 步：撤掉洞内盖板，捕获目标点击后推进（v1 仅 1 处：月视图点日期） */
  advanceOnTargetClick?: boolean
}

/** 教程状态机状态 */
export type TourStatus = 'idle' | 'running' | 'done'
