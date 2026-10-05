/**
 * tour 公共出口：引擎/步骤/类型/存储。
 */
export { TourProvider, useTour, TARGET_WAIT_TIMEOUT } from './engine'
export { TOUR_STEPS } from './steps'
export type { TourApi, TourStep, TourPlatform, TourStatus } from './types'
export { computePlacement, maskRects, holeOf } from './placement'
export type { Rect, PlacementResult, PlacementInput } from './placement'
export {
  hasOnboarded,
  completeOnboarding,
  isTourDone,
  completeTour,
  shouldAutoStart,
  requestRewatch,
  onTourStoreChange,
  _resetTourStoreForTest,
} from './store'
