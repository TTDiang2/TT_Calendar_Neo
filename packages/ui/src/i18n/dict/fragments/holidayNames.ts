/**
 * holidayNames 命名空间：中国法定节假日名的显示映射。
 * 节日名来自 chinese_calendar 静态数据（zh 字符串，持久化数据），
 * holidayName(t, name) 精确匹配映射显示；未收录的名字（组合名等）原样显示。
 */
export const holidayNames = {
  zh: {
    newYear: '元旦',
    springFestival: '春节',
    qingming: '清明节',
    labourDay: '劳动节',
    dragonBoat: '端午节',
    midAutumn: '中秋节',
    nationalDay: '国庆节',
  },
  en: {
    newYear: "New Year's Day",
    springFestival: 'Spring Festival',
    qingming: 'Qingming Festival',
    labourDay: 'Labour Day',
    dragonBoat: 'Dragon Boat Festival',
    midAutumn: 'Mid-Autumn Festival',
    nationalDay: 'National Day',
  },
} as const
