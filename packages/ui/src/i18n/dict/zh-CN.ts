/**
 * zh-CN 主字典（翻译基准）。
 * 由各命名空间 fragment 的 zh 部分组装；fragment 按抽词批次归属（一个批次一个文件，避免并行冲突）。
 * TxKey/PluralKey 类型从本字典推导，key 拼错是编译错误。
 */
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

export const zhCN = {
  common: common.zh,
  terms: terms.zh,
  layers: layers.zh,
  topbar: topbar.zh,
  countdown: countdown.zh,
  holidayNames: holidayNames.zh,
  palette: palette.zh,
  language: language.zh,
  lunar: lunar.zh,
  shell: shell.zh,
  calendar: calendar.zh,
  todo: todo.zh,
  todoEditor: todoEditor.zh,
  widgetsView: widgetsView.zh,
  dialogs: dialogs.zh,
  stats: stats.zh,
  settings: settings.zh,
  app: app.zh,
  mobile: mobile.zh,
} as const

export type Dict = typeof zhCN
