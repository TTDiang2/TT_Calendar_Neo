/**
 * English 字典（pivot 语言：ja/ko 参照 zh 直译，fr/es/ru 由 en 转译）。
 * 由各 fragment 的 en 部分组装；结构测试保证 key 与 zh-CN 深度一致、复数类别齐全。
 */
import type { DeepPartialDict } from './types'
import type { Dict } from './zh-CN'
import { common } from './fragments/common'
import { terms } from './fragments/terms'
import { layers } from './fragments/layers'
import { topbar } from './fragments/topbar'
import { countdown } from './fragments/countdown'
import { holidayNames } from './fragments/holidayNames'
import { palette } from './fragments/palette'
import { language } from './fragments/language'
import { lunar } from './fragments/lunar'
import { shell } from './fragments/shell'
import { calendar } from './fragments/calendar'
import { todo } from './fragments/todo'
import { todoEditor } from './fragments/todoEditor'
import { widgetsView } from './fragments/widgetsView'
import { dialogs } from './fragments/dialogs'
import { stats } from './fragments/stats'
import { settings } from './fragments/settings'
import { app } from './fragments/app'
import { mobile } from './fragments/mobile'

export const en: DeepPartialDict<Dict> = {
  common: common.en,
  terms: terms.en,
  layers: layers.en,
  topbar: topbar.en,
  countdown: countdown.en,
  holidayNames: holidayNames.en,
  palette: palette.en,
  language: language.en,
  lunar: lunar.en,
  shell: shell.en,
  calendar: calendar.en,
  todo: todo.en,
  todoEditor: todoEditor.en,
  widgetsView: widgetsView.en,
  dialogs: dialogs.en,
  stats: stats.en,
  settings: settings.en,
  app: app.en,
  mobile: mobile.en,
}
