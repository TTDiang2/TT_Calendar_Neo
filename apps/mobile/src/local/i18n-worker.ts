/**
 * Worker/本地库侧的 i18n 入口（apps/mobile local 层共用）。
 * Worker realm 没有 localStorage/navigator：activeLang() 在这里安全回落 zh-CN；
 * 主线程侧（backend.ts/main.tsx）拿得到真实语言。见 mobile fragment 头 TODO-REVIEW。
 */
import { makeI18n, activeLang } from '@tt-calendar/ui'

export const i18n = makeI18n(activeLang())
