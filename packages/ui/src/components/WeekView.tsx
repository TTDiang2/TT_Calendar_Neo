import { useState } from 'react'
import type { Day, Layer, MonthData } from '../adapt/types'
import { fmtWeekday, useLang } from '../i18n'
import { DayCell } from './DayCell'

interface Props {
  monthData: MonthData
  layers: Layer[]
  selectedDate: string | null
  onSelect: (date: string) => void
  onDoubleClick: (date: string) => void
  onContextMenu: (e: { clientX: number; clientY: number }, date: string) => void
  onDragStart: (date: string) => void
  onDrop: (date: string) => void
}

export function WeekView({ monthData, layers, selectedDate, onSelect, onDoubleClick, onContextMenu, onDragStart, onDrop }: Props) {
  const lang = useLang()
  const [dragOver, setDragOver] = useState<string | null>(null)
  // 星期表头：Intl 产出（锚点 2023-01-02 是周一，i 偏移即得周一开头的顺序），禁手写数组（规范 §3）
  const weekdays = Array.from({ length: 7 }, (_, i) => fmtWeekday(lang, new Date(2023, 0, 2 + i), 'short'))
  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="grid grid-cols-7 gap-1 mb-1">
        {weekdays.map((w, i) => (
          <div
            key={i}
            className={`text-center text-xs font-medium py-1 ${i >= 5 ? 'text-red-400' : 'text-gray-400'}`}
          >
            {w}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1 flex-1 min-h-0" onDragEnd={() => setDragOver(null)}>
        {monthData.days.map((day: Day) => (
          <DayCell
            key={day.date}
            day={day}
            layers={layers}
            selected={selectedDate === day.date}
            dragOver={dragOver === day.date}
            onClick={onSelect}
            onDoubleClick={onDoubleClick}
            onContextMenu={onContextMenu}
            onDragStart={(d) => {
              onDragStart(d)
              setDragOver(d)
            }}
            onDragEnter={(d) => setDragOver(d)}
            onDrop={(d) => {
              setDragOver(null)
              onDrop(d)
            }}
            maxLabels={6}
          />
        ))}
      </div>
    </div>
  )
}
