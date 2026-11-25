import type { ReactNode } from 'react'

interface DayHeadProps {
  /** The name of the day, as a heading or button. */
  name: ReactNode
  isToday: boolean
  /** The worked hours of the day. */
  total: string
  /** Whether to flag that entries of the day overlap. */
  overlaps?: boolean
}

/** The first line of a day, open or collapsed. */
export function DayHead({
  name,
  isToday,
  total,
  overlaps = false,
}: DayHeadProps) {
  return (
    <div className="day-head">
      {name}
      {isToday && <span className="today-pill">Today</span>}
      <span className="day-total num">{total}</span>
      {overlaps && <span className="overlap-flag">overlaps</span>}
    </div>
  )
}
