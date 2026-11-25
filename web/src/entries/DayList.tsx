import type { ReactNode } from 'react'
import type { Temporal } from 'temporal-polyfill'
import { CollapsedDay } from './CollapsedDay.tsx'
import type { Day } from './day.ts'

interface DayListProps {
  /** The days from top to bottom. */
  days: Day[]
  /** The date of the open day. */
  openDate: Temporal.PlainDate
  today: Temporal.PlainDate
  onOpen: (date: Temporal.PlainDate) => void
  renderOpen: (day: Day) => ReactNode
}

/** The days of a period: one open, the others one line. */
export function DayList({
  days,
  openDate,
  today,
  onOpen,
  renderOpen,
}: DayListProps) {
  return (
    <div className="day-list">
      {days.map((day) =>
        day.date.equals(openDate) ? (
          renderOpen(day)
        ) : (
          <CollapsedDay
            key={day.date.toString()}
            day={day}
            isToday={day.date.equals(today)}
            onOpen={() => onOpen(day.date)}
          />
        ),
      )}
    </div>
  )
}
