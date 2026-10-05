/**
 * 教程步骤表（20261005 智者定稿：移动 12 步主干 + 桌面专属步）。
 * before 全部为幂等绝对断言；platform 按 useIsMobile 在进入该步时求值。
 * 每步 content key 的字典存在性由 __tests__/tour-steps.test.ts 守门。
 */
import type { TourStep } from './types'

export const TOUR_STEPS: readonly TourStep[] = [
  // 1 欢迎第二拍（居中大卡）
  {
    id: 'welcome-2',
    titleKey: 'tour.steps.s1Title',
    bodyKey: 'tour.steps.s1Body',
    placement: 'bottom',
    before: (api) => api.resetToHome(),
  },
  // 2 四个主入口（移动=dock 中间 tab 区 / 桌面=TopBar 分段控件）
  {
    id: 'tabs-mobile',
    target: 'dock-tabs',
    titleKey: 'tour.steps.s2mTitle',
    bodyKey: 'tour.steps.s2mBody',
    placement: 'top',
    platform: 'mobile',
  },
  {
    id: 'tabs-desktop',
    target: 'topbar-tabs',
    titleKey: 'tour.steps.s2dTitle',
    bodyKey: 'tour.steps.s2dBody',
    placement: 'bottom',
    platform: 'desktop',
  },
  // 3 日历视图胶囊（两端同 target：移动 TopBar 也在）
  {
    id: 'mode-pills',
    target: 'mode-pills',
    titleKey: 'tour.steps.s3Title',
    bodyKey: 'tour.steps.s3Body',
    placement: 'bottom',
    before: (api) => api.setMode('month'),
  },
  // 3d+ 桌面专属：周视图
  {
    id: 'mode-week-desktop',
    target: 'mode-pills',
    titleKey: 'tour.steps.s3dTitle',
    bodyKey: 'tour.steps.s3dBody',
    placement: 'bottom',
    platform: 'desktop',
    before: (api) => api.setMode('week'),
  },
  // 4 月视图 hands-on（唯一动手步）
  {
    id: 'month-grid',
    target: 'month-grid-mobile',
    titleKey: 'tour.steps.s4Title',
    bodyKey: 'tour.steps.s4Body',
    placement: 'top',
    platform: 'mobile',
    advanceOnTargetClick: true,
    before: (api) => api.setMode('month'),
  },
  {
    id: 'month-grid-desktop',
    target: 'month-grid-desktop',
    titleKey: 'tour.steps.s4Title',
    bodyKey: 'tour.steps.s4Body',
    placement: 'top',
    platform: 'desktop',
    advanceOnTargetClick: true,
    before: (api) => api.setMode('month'),
  },
  // 5 右侧详情（移动=右抽屉 / 桌面=常驻右栏）
  {
    id: 'right-mobile',
    target: 'right-drawer',
    titleKey: 'tour.steps.s5mTitle',
    bodyKey: 'tour.steps.s5mBody',
    placement: 'left',
    platform: 'mobile',
    // 右抽屉存在条件：topTab=calendar 且 mode≠year（App.tsx:931）——before 断言复合状态
    before: (api) => {
      api.goTab('calendar')
      api.setMode('month')
      api.openRight()
    },
    after: (api) => api.closeRight(),
  },
  {
    id: 'right-desktop',
    target: 'detail-panel-desktop',
    titleKey: 'tour.steps.s5dTitle',
    bodyKey: 'tour.steps.s5dBody',
    placement: 'left',
    platform: 'desktop',
    before: (api) => {
      api.goTab('calendar')
      api.setMode('month')
    },
  },
  // 6 左侧（移动=左抽屉 / 桌面=常驻侧栏）
  {
    id: 'layers-mobile',
    target: 'layers-drawer',
    titleKey: 'tour.steps.s6mTitle',
    bodyKey: 'tour.steps.s6mBody',
    placement: 'right',
    platform: 'mobile',
    before: (api) => {
      api.goTab('calendar')
      api.openLayers()
    },
    after: (api) => api.closeLayers(),
  },
  {
    id: 'layers-desktop',
    target: 'sidebar-desktop',
    titleKey: 'tour.steps.s6dTitle',
    bodyKey: 'tour.steps.s6dBody',
    placement: 'right',
    platform: 'desktop',
    before: (api) => api.goTab('calendar'),
  },
  // 7 切到待办页（移动=dock 待办格 / 桌面=TopBar）
  {
    id: 'todo-mobile',
    target: 'dock-tab-todo',
    titleKey: 'tour.steps.s7Title',
    bodyKey: 'tour.steps.s7Body',
    placement: 'top',
    platform: 'mobile',
    before: (api) => api.goTab('todo'),
  },
  {
    id: 'todo-desktop',
    target: 'topbar-tabs',
    titleKey: 'tour.steps.s7Title',
    bodyKey: 'tour.steps.s7Body',
    placement: 'bottom',
    platform: 'desktop',
    before: (api) => api.goTab('todo'),
  },
  // 8 待办视图胶囊
  {
    id: 'todo-view-pills',
    target: 'todo-view-pills',
    titleKey: 'tour.steps.s8Title',
    bodyKey: 'tour.steps.s8Body',
    placement: 'bottom',
    before: (api) => api.setTodoView('list'),
  },
  // 8d+ 桌面专属：看板
  {
    id: 'todo-kanban-desktop',
    target: 'todo-view-pills',
    titleKey: 'tour.steps.s8dTitle',
    bodyKey: 'tour.steps.s8dBody',
    placement: 'bottom',
    platform: 'desktop',
    before: (api) => api.setTodoView('kanban'),
  },
  // 9 FAB 快速新建（仅移动；桌面新建在各视图内）
  {
    id: 'fab-new',
    target: 'fab-new',
    titleKey: 'tour.steps.s9Title',
    bodyKey: 'tour.steps.s9Body',
    placement: 'top',
    platform: 'mobile',
    before: (api) => api.goTab('calendar'),
  },
  // 10 分析页（成就墙）
  {
    id: 'stats-mobile',
    target: 'dock-tab-stats',
    titleKey: 'tour.steps.s10Title',
    bodyKey: 'tour.steps.s10Body',
    placement: 'top',
    platform: 'mobile',
    before: (api) => api.goTab('stats'),
  },
  {
    id: 'stats-desktop',
    target: 'topbar-tabs',
    titleKey: 'tour.steps.s10Title',
    bodyKey: 'tour.steps.s10Body',
    placement: 'bottom',
    platform: 'desktop',
    before: (api) => api.goTab('stats'),
  },
  // 11 设置弹窗 → 数据同步节（真开弹窗、真高亮、假操作）
  {
    id: 'settings-sync',
    target: 'sync-section',
    titleKey: 'tour.steps.s11Title',
    bodyKey: 'tour.steps.s11Body',
    placement: 'top',
    before: (api) => api.openSettings(),
    after: (api) => api.closeDialog(),
  },
  // 12 结束卡（居中）
  {
    id: 'end',
    titleKey: 'tour.steps.s12Title',
    bodyKey: 'tour.steps.s12Body',
    placement: 'bottom',
    before: (api) => api.resetToHome(),
  },
]
