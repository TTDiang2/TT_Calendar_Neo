/**
 * 面向用户的结构化数据 → 显示文案（本地化任务书：domain/db 只出结构与枚举，
 * 文案在这里按语言组装）。图层名见 layerLabel.ts。
 */
import type { CountdownItem, CountdownLabel, LunarInfoView } from '@tt-calendar/contracts'
import type { I18n, Lang } from '../i18n/core'
import { isCJK } from '../i18n/core'

type T = I18n['t']
type TPlural = I18n['tPlural']

// 农历月/日字典 key 静态表（避免动态拼 key 丢类型）
const LUNAR_MONTH_KEYS = ['lunar.month.m1', 'lunar.month.m2', 'lunar.month.m3', 'lunar.month.m4', 'lunar.month.m5', 'lunar.month.m6', 'lunar.month.m7', 'lunar.month.m8', 'lunar.month.m9', 'lunar.month.m10', 'lunar.month.m11', 'lunar.month.m12'] as const
const LUNAR_DAY_KEYS = ['lunar.day.d1', 'lunar.day.d2', 'lunar.day.d3', 'lunar.day.d4', 'lunar.day.d5', 'lunar.day.d6', 'lunar.day.d7', 'lunar.day.d8', 'lunar.day.d9', 'lunar.day.d10', 'lunar.day.d11', 'lunar.day.d12', 'lunar.day.d13', 'lunar.day.d14', 'lunar.day.d15', 'lunar.day.d16', 'lunar.day.d17', 'lunar.day.d18', 'lunar.day.d19', 'lunar.day.d20', 'lunar.day.d21', 'lunar.day.d22', 'lunar.day.d23', 'lunar.day.d24', 'lunar.day.d25', 'lunar.day.d26', 'lunar.day.d27', 'lunar.day.d28', 'lunar.day.d29', 'lunar.day.d30'] as const

/**
 * 农历显示文案（Day.lunar 结构化信息 → 按语言组装）。
 * 三档策略（v1.1）：zh/ja/ko 显示；en/fr/es/ru 默认隐藏（返回 ''，P5 加设置开关后放开）。
 * 初一只显示月名（zh 传统约定，与旧版 lunarName 行为一致）。
 */
export function lunarText(t: T, lang: Lang, info: LunarInfoView | null | undefined): string {
  if (!info || !isCJK(lang)) return ''
  const prefix = info.leap ? t('lunar.leapPrefix') : ''
  const month = t(LUNAR_MONTH_KEYS[info.month - 1] ?? 'lunar.month.m1')
  if (info.day === 1) return prefix + month
  const day = t(LUNAR_DAY_KEYS[info.day - 1] ?? 'lunar.day.d1')
  return prefix + month + t('lunar.daySep') + day
}

/** 倒数日列表行的标题后缀（「今年 / 3 周年 / 农历周年 / 第 800 天」）。 */
export function countdownLabelSuffix(t: T, label: CountdownLabel): string {
  switch (label.kind) {
    case 'thisYear':
      return t('countdown.suffixThisYear')
    case 'solarAnniversary':
      return t('countdown.suffixAnniversary', { n: label.years })
    case 'lunarAnniversary':
      return t('countdown.suffixLunarAnniversary')
    case 'milestone':
      return t('countdown.suffixMilestone', { n: label.days })
  }
}

/** 倒数日列表行完整标题：名称 + 可选后缀（替代旧 display 字段）。 */
export function countdownDisplay(t: T, item: Pick<CountdownItem, 'name' | 'label'>): string {
  const suffix = item.label ? countdownLabelSuffix(t, item.label) : ''
  return `${item.name} ${suffix}`.trim()
}

/**
 * 顶部一句话倒数（原 domain buildCountdownText，按语言组装）。
 * 复数由字典承担（en one/other；ru 在 P3 补全四类别）。
 */
export function countdownBanner(t: T, tPlural: TPlural, items: readonly CountdownItem[]): string {
  const upcoming = items.filter((i) => !i.passed)
  if (upcoming.length > 0) {
    const nearest = upcoming[0]
    if (nearest.is_today) return t('countdown.bannerToday', { name: nearest.name })
    return tPlural('countdown.bannerUpcoming', nearest.days_left, { name: nearest.name })
  }
  if (items.length > 0) {
    const latest = items[items.length - 1]
    return tPlural('countdown.bannerPassed', -latest.days_left, { name: latest.name })
  }
  return t('countdown.bannerEmpty')
}

/** 倒数日固定分类的显示名（存储值是中文常量数据，自定义分类原样显示）。 */
const CATEGORY_KEYS: Record<string, Parameters<T>[0]> = {
  生日: 'countdown.categoryBirthday',
  纪念日: 'countdown.categoryAnniversary',
  节日: 'countdown.categoryFestival',
  重要事件: 'countdown.categoryImportant',
  其他: 'countdown.categoryOther',
}

export function countdownCategoryLabel(t: T, category: string | null | undefined): string {
  if (!category) return ''
  const key = CATEGORY_KEYS[category]
  return key ? t(key) : category
}

/** 节假日名显示映射（chinese_calendar 数据是 zh 串；未收录的原样显示）。 */
const HOLIDAY_NAME_KEYS: Record<string, Parameters<T>[0]> = {
  元旦: 'holidayNames.newYear',
  春节: 'holidayNames.springFestival',
  清明节: 'holidayNames.qingming',
  劳动节: 'holidayNames.labourDay',
  端午节: 'holidayNames.dragonBoat',
  中秋节: 'holidayNames.midAutumn',
  国庆节: 'holidayNames.nationalDay',
}

export function holidayName(t: T, name: string | null | undefined): string {
  if (!name) return ''
  const key = HOLIDAY_NAME_KEYS[name]
  return key ? t(key) : name
}
