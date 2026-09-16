import { useEffect, useState } from 'react'

/**
 * 响应式断点订阅：SSR 安全（首帧按 false 渲染，挂载后同步真实值）。
 * 与 Tailwind 的 md 断点（768px）保持同一阈值，CSS 类与 JS 行为不会打架。
 */
function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(query).matches : false,
  )

  useEffect(() => {
    const mql = window.matchMedia(query)
    const onChange = (e: MediaQueryListEvent) => setMatches(e.matches)
    setMatches(mql.matches)
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [query])

  return matches
}
/** 手机竖屏（<768px，与 BottomTabBar/TopBar 的 md: 断点一致） */
export function useIsMobile(): boolean {
  return useMediaQuery('(max-width: 767px)')
}
