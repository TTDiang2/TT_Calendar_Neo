/**
 * @tt-calendar/domain — 纯业务逻辑层。
 *
 * 铁律：**零 IO**。不 import 任何 fs / fetch / db / tauri 的东西。
 * 换来的是：单测不需要 mock，且将来迁到任何新平台（移动端 webview、Web、CLI）
 * 这一层一行都不用改。
 */

export * from './date'
export * from './text'
export * from './color'
export * from './todo'
export * from './busy'
export * from './countdown'
export * from './lunar'
export * from './holiday'
export * from './holiday-data'
export * from './todo-repeat'
export * from './layers'
export * from './merge'
export * from './view'
