/**
 * countdown 命名空间：倒数日标签与顶部一句话倒数。
 * domain 只产出结构化标签（contracts CountdownLabel），文案在此组装。
 * name 是用户数据（倒数日名称），经 {name} 插值原样输出。
 * 分类值（生日/纪念日/…）是持久化数据，categoryLabel() 按值映射显示。
 */
export const countdown = {
  zh: {
    /** 列表行标题后缀（buildCountdownList 的 showLabel 规则） */
    suffixThisYear: '今年',
    suffixAnniversary: '{n} 周年',
    suffixLunarAnniversary: '农历周年',
    suffixMilestone: '第 {n} 天',
    /** 顶部一句话倒数（App 顶栏 countdown 字段） */
    bannerToday: '🎉 今天是「{name}」',
    bannerUpcoming: { other: '距离「{name}」还有 {n} 天' },
    bannerPassed: { other: '「{name}」已过 {n} 天' },
    bannerEmpty: '暂无倒数日',
    /** 固定分类的显示名（存储值保持中文常量，显示按语言映射） */
    categoryBirthday: '生日',
    categoryAnniversary: '纪念日',
    categoryFestival: '节日',
    categoryImportant: '重要事件',
    categoryOther: '其他',
  },
  en: {
    suffixThisYear: 'this year',
    suffixAnniversary: '{n}-year anniversary',
    suffixLunarAnniversary: 'lunar anniversary',
    suffixMilestone: 'Day {n}',
    bannerToday: '🎉 Today is "{name}"',
    bannerUpcoming: { one: '1 day until "{name}"', other: '{n} days until "{name}"' },
    bannerPassed: { one: '"{name}" was 1 day ago', other: '"{name}" was {n} days ago' },
    bannerEmpty: 'No countdowns yet',
    categoryBirthday: 'Birthday',
    categoryAnniversary: 'Anniversary',
    categoryFestival: 'Festival',
    categoryImportant: 'Important event',
    categoryOther: 'Other',
  },
} as const
