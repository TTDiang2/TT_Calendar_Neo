/**
 * 语言字典注册表。翻译产出一个语言就在这里挂一个（静态 import，不做懒加载——
 * 全量 gzip 后几十 KB，iOS 离线包无压力）。
 * 缺席的语言在 fallback 链里自动回落到 zh-CN。
 */
import type { Dict } from './zh-CN'
import { zhCN } from './zh-CN'
import { en } from './en'
import { ja } from './ja'
import { ko } from './ko'
import { fr } from './fr'
import { zhHant } from './zh-Hant'
import { es } from './es'

export const DICTS: Partial<Record<string, Dict>> = {
  'zh-CN': zhCN,
  en: en as Dict,
  ja: ja as Dict,
  fr: fr as Dict,
  ko: ko as Dict,
  'zh-Hant': zhHant as Dict,
  es: es as Dict,
}
