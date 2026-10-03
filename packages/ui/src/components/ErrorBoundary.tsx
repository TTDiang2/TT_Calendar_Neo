import { Component, type ErrorInfo, type ReactNode } from 'react'
import { activeLang, makeI18n } from '../i18n'

interface State {
  hasError: boolean
  message: string
}

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { hasError: false, message: '' }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error.message }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('App error:', error, info)
  }

  render() {
    if (this.state.hasError) {
      // 类组件拿不到 useT()，走非 React 入口（makeI18n 按语言缓存，反复调用无开销）
      const t = makeI18n(activeLang()).t
      return (
        <div className="h-full flex flex-col items-center justify-center gap-3 p-8 text-center">
          <p className="text-lg font-semibold text-gray-700">{t('dialogs.errorBoundary.title')}</p>
          <p className="text-sm text-gray-500 max-w-md">{this.state.message}</p>
          <button
            onClick={() => this.setState({ hasError: false, message: '' })}
            className="mt-2 px-4 py-1.5 text-sm bg-pink-500 text-white rounded-lg hover:bg-pink-600"
          >
            {t('common.retry')}
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
