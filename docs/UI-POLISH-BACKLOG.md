# UI 打磨待办（P2 记档）

> 来源：20260915 夜智者复审裁定「允许交付」时记档的下一轮打磨项。
> 状态均为未开始；动手前先与当轮任务书对齐优先级。

1. **圆底 colorLayers 并入 dayVisuals.ts**：MobileDayCell 与 DayCell 各有一份
   涂色/图层圆底（colorLayers）叠层逻辑，应提取到 `components/dayVisuals.ts`
   共享，真正消除双份拷贝（20260915 只共享了 events/dots 部分）。
2. **TopBar 按钮按压反馈**：全部图标按钮统一接入 `.pressable`（弹簧回缩）。
3. **Modal 与两侧抽屉的退场动画**：目前只有入场（animSpringIn / animDrawerIn），
   关闭是瞬间消失；补方向相反的退场后再卸载。
4. **StatsView 辅助小字加深**：满屏 `text-gray-400/300` 的 11px 文字躺在
   半透明玻璃卡上，对比度随极光背景漂移，需系统性加深一档。
5. **小目标 44pt 触达**：Modal 关闭钮等 28px 小按钮扩大热区（视觉不变、
   padding 或伪元素扩大可点区域）。
6. ~~MonthGrid 过时注释~~（20260916 已顺手清理）。
