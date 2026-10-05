/**
 * 欢迎屏（20261005 智者定稿）：语言选择确认后、主界面前的独立一屏。
 * 三条硬规则：
 *  1. 两个按钮都写 onboarded（tt.onboarded-v1）——「先随便看看」同时写 tourDone（跳过=完成）；
 *  2. 存量升级用户永不触达（AppGate 用 hasOnboarded 门控）；
 *  3. 必须以刚选择的语言渲染（I18nProvider 在外层，语言写入先于导航——时序由
 *     i18n-language-switch 测试族保障）。
 */
import { CalendarHeart } from 'lucide-react'
import { completeOnboarding } from '../tour'
import { useT } from '../i18n'

export function WelcomeScreen() {
  const t = useT()
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-gradient-to-b from-rose-50 via-pink-50 to-orange-50 overflow-y-auto">
      <div className="w-full max-w-sm px-8 py-10 text-center">
        <span className="inline-flex w-20 h-20 rounded-[1.75rem] bg-white/80 shadow-lg shadow-pink-200/60 items-center justify-center mb-6">
          <CalendarHeart size={40} className="text-pink-500" />
        </span>
        <h1 className="text-2xl font-bold text-gray-800">{t('tour.welcome.title')}</h1>
        <p className="mt-4 text-[15px] leading-relaxed text-gray-500">{t('tour.welcome.body')}</p>
        <div className="mt-10 flex flex-col gap-3">
          <button
            onClick={() => completeOnboarding(false)}
            className="w-full py-3 rounded-2xl bg-gradient-to-br from-pink-500 to-rose-500 text-white text-sm font-semibold shadow-lg shadow-pink-500/30 hover:brightness-105 active:brightness-95 transition"
          >
            {t('tour.welcome.startTour')}
          </button>
          <button
            onClick={() => completeOnboarding(true)}
            className="w-full py-3 rounded-2xl bg-white/70 border border-white text-gray-500 text-sm hover:bg-white transition"
          >
            {t('tour.welcome.skip')}
          </button>
        </div>
      </div>
    </div>
  )
}
