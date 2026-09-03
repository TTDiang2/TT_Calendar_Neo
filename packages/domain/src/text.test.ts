import { describe, expect, it } from 'vitest'

import { firstLine, htmlToPlain, stripBrackets, subActionOf, truncate } from './text'

describe('htmlToPlain', () => {
  it('剥标签、实体反转义、空白折叠（与 Python 一致：换行也被折叠成空格）', () => {
    expect(htmlToPlain('<p>第一段<br>第二段</p>')).toBe('第一段 第二段')
    expect(htmlToPlain('A&nbsp;&amp;&nbsp;B')).toBe('A & B')
    expect(htmlToPlain('<b>粗</b><i>斜</i>体')).toBe('粗斜体')
    expect(htmlToPlain('a  \n\t b')).toBe('a b')
  })

  it('数字实体', () => {
    expect(htmlToPlain('&#65;&#66;')).toBe('AB')
  })

  it('空值安全', () => {
    expect(htmlToPlain(null)).toBe('')
    expect(htmlToPlain(undefined)).toBe('')
    expect(htmlToPlain('')).toBe('')
  })
})

describe('firstLine / truncate', () => {
  it('firstLine 取首行并截断加省略号', () => {
    expect(firstLine('第一行\n第二行')).toBe('第一行')
    expect(firstLine('x'.repeat(50), 40)).toBe('x'.repeat(39) + '…')
    expect(firstLine('short', 40)).toBe('short')
    expect(firstLine(null)).toBe('')
  })

  it('truncate', () => {
    expect(truncate('abcdefgh', 5)).toBe('abcd…')
    expect(truncate('abc', 5)).toBe('abc')
    expect(truncate(null, 5)).toBe('')
  })
})

describe('stripBrackets / subActionOf（集思录事件标题约定）', () => {
  it('【前缀】分离', () => {
    expect(stripBrackets('【下修股东会】山鹰转债')).toEqual(['下修股东会', '山鹰转债'])
    expect(stripBrackets('没有括号')).toEqual(['', '没有括号'])
    expect(stripBrackets('【未闭合')).toEqual(['', '【未闭合'])
    expect(stripBrackets(null)).toEqual(['', ''])
  })

  it('subActionOf 提取子动作', () => {
    expect(subActionOf('【申购日】天脉转债')).toBe('申购日')
    expect(subActionOf('无括号')).toBeNull()
    expect(subActionOf(null)).toBeNull()
  })
})
