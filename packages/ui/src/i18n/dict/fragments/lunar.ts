/**
 * lunar 命名空间：农历月名/日名（Day.lunar 结构化信息 → 显示文案，adapt/labels.ts lunarText）。
 * zh 月名含「月」字（正月..腊月）；日名初一..三十；初一只显示月名（zh 传统约定）。
 * 非中日韩语言默认隐藏农历（isCJK 三档策略，v1.1 决策），en 译文备用于设置开关开启后。
 */
export const lunar = {
  zh: {
    leapPrefix: '闰',
    month: {
      m1: '正月', m2: '二月', m3: '三月', m4: '四月', m5: '五月', m6: '六月',
      m7: '七月', m8: '八月', m9: '九月', m10: '十月', m11: '冬月', m12: '腊月',
    },
    day: {
      d1: '初一', d2: '初二', d3: '初三', d4: '初四', d5: '初五', d6: '初六', d7: '初七', d8: '初八', d9: '初九', d10: '初十',
      d11: '十一', d12: '十二', d13: '十三', d14: '十四', d15: '十五', d16: '十六', d17: '十七', d18: '十八', d19: '十九', d20: '二十',
      d21: '廿一', d22: '廿二', d23: '廿三', d24: '廿四', d25: '廿五', d26: '廿六', d27: '廿七', d28: '廿八', d29: '廿九', d30: '三十',
    },
    /** 月名与日名之间的连接符（zh 直接连写，拉丁语言需要分隔） */
    daySep: '',
  },
  en: {
    leapPrefix: 'Leap ',
    month: {
      m1: '1st lunar month', m2: '2nd lunar month', m3: '3rd lunar month', m4: '4th lunar month', m5: '5th lunar month', m6: '6th lunar month',
      m7: '7th lunar month', m8: '8th lunar month', m9: '9th lunar month', m10: '10th lunar month', m11: '11th lunar month', m12: '12th lunar month',
    },
    day: {
      d1: 'day 1', d2: 'day 2', d3: 'day 3', d4: 'day 4', d5: 'day 5', d6: 'day 6', d7: 'day 7', d8: 'day 8', d9: 'day 9', d10: 'day 10',
      d11: 'day 11', d12: 'day 12', d13: 'day 13', d14: 'day 14', d15: 'day 15', d16: 'day 16', d17: 'day 17', d18: 'day 18', d19: 'day 19', d20: 'day 20',
      d21: 'day 21', d22: 'day 22', d23: 'day 23', d24: 'day 24', d25: 'day 25', d26: 'day 26', d27: 'day 27', d28: 'day 28', d29: 'day 29', d30: 'day 30',
    },
    daySep: ', ',
  },
} as const
