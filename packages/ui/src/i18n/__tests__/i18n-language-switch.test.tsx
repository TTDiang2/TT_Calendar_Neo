// @vitest-environment jsdom
// P2 冒烟：语言切换即时生效（无需刷新）+ 首启动选择页确认流。
// 纪律：jsdom navigator.language 恒 en-US——用例不依赖它，一律显式控制。
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act, cleanup, render, screen, fireEvent } from '@testing-library/react'
import { I18nProvider, useT } from '../runtime'
import { chooseLang, getChosenLang, hasChosenLang, _resetForTest } from '../store'
import { LanguagePickerScreen } from '../../components/LanguagePickerScreen'

function Probe() {
  const t = useT()
  return <p>{t('common.confirm')}</p>
}

describe('I18nProvider 语言切换', () => {
  beforeEach(() => {
    localStorage.clear()
    _resetForTest()
  })
  afterEach(() => {
    cleanup()
    localStorage.clear()
    _resetForTest()
  })

  it('chooseLang 后同一棵树文本即时变化（不重挂载）', () => {
    render(<I18nProvider><Probe /></I18nProvider>)
    // 未选择语言时回落系统语言（jsdom en-US → en）
    expect(screen.getByText('Confirm')).toBeTruthy()
    act(() => chooseLang('zh-CN'))
    expect(screen.getByText('确认')).toBeTruthy()
    act(() => chooseLang('ja'))
    // P3 ja 批次已产出 ja 字典 → 不再回落，直接显示 ja 译文
    expect(screen.getByText('確認')).toBeTruthy()
  })

  it('chooseLang 持久化到 localStorage', () => {
    chooseLang('fr')
    expect(localStorage.getItem('tt.lang')).toBe('fr')
    expect(getChosenLang()).toBe('fr')
    expect(hasChosenLang()).toBe(true)
  })
})

describe('LanguagePickerScreen 首启动选择页', () => {
  beforeEach(() => {
    localStorage.clear()
    _resetForTest()
  })
  afterEach(() => {
    cleanup()
    localStorage.clear()
    _resetForTest()
  })

  it('列出全部语言（endonym）且点确认后写入选择', () => {
    render(<I18nProvider><LanguagePickerScreen /></I18nProvider>)
    expect(screen.getByText('简体中文')).toBeTruthy()
    expect(screen.getByText('English')).toBeTruthy()
    expect(screen.getByText('日本語')).toBeTruthy()
    expect(screen.getByText('한국어')).toBeTruthy()
    expect(screen.getByText('Français')).toBeTruthy()
    expect(screen.getByText('Español')).toBeTruthy()
    expect(screen.getByText('Русский')).toBeTruthy()
    expect(screen.getByText('繁體中文')).toBeTruthy()
    expect(hasChosenLang()).toBe(false)
    // 点日语 → 确认
    fireEvent.click(screen.getByText('日本語'))
    fireEvent.click(screen.getByText(/开始使用|Get started|始める|Empezar|Commencer|Начать/))
    expect(getChosenLang()).toBe('ja')
    expect(hasChosenLang()).toBe(true)
  })
})
