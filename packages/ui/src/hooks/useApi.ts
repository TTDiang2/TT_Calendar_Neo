import { useQuery } from '@tanstack/react-query'
import { getView, getLayers, getCountdownList } from '../adapt/api'
import { countdownBanner } from '../adapt/labels'
import { useLang, useT, useTPlural } from '../i18n'
import type { ViewMode, MonthData, YearData } from '../adapt/types'

export function useViewData(mode: ViewMode, anchor: string) {
  return useQuery<MonthData | YearData>({
    queryKey: ['view', mode, anchor],
    queryFn: () => getView(mode, anchor),
    staleTime: 60_000,
  })
}

export function useLayers() {
  return useQuery({
    queryKey: ['layers'],
    queryFn: getLayers,
    staleTime: 60_000,
  })
}

/**
 * 顶部一句话倒数（原后端 getCountdownText 已移除：文案含语言，
 * 由 UI 层用结构化数据按当前语言组装，见 adapt/labels.ts countdownBanner）。
 * 语言进 queryKey：切语言立即重算。
 */
export function useCountdown() {
  const t = useT()
  const tPlural = useTPlural()
  const lang = useLang()
  return useQuery({
    queryKey: ['countdownBanner', lang],
    queryFn: async () => countdownBanner(t, tPlural, await getCountdownList()),
    staleTime: 60_000,
  })
}
