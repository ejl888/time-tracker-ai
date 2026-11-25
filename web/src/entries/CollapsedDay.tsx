import { overlaps } from '../domain/entries.ts'
import { formatLongDate, formatShortDate } from './dateText.ts'
import type { Day } from './day.ts'
import { workedText } from './day.ts'
import { DayHead } from './DayHead.tsx'

interface CollapsedDayProps {
  day: Day
  isToday: boolean
  /** Called when the day is clicked. */
  onOpen: () => void
}

/** The worked hours and number of entries, e.g. "7:45 worked · 5 entries". */
function totalText(day: Day): string {
  const count = day.entries.length
  if (count === 0) return 'Nothing logged'
  return `${workedText(day)} · ${count} ${count === 1 ? 'entry' : 'entries'}`
}

/** A day in one line. Clicking anywhere on it opens it; the button is there for the keyboard. */
export function CollapsedDay({ day, isToday, onOpen }: CollapsedDayProps) {
  const name = formatLongDate(day.date)
  return (
    // A click on the button bubbles up to the section, so only the section handles it.
    <section className="day collapsed" aria-label={name} onClick={onOpen}>
      <DayHead
        name={
          <button
            type="button"
            className="day-name"
            aria-label={`Open ${name}`}
          >
            {formatShortDate(day.date)}
          </button>
        }
        isToday={isToday}
        total={totalText(day)}
        overlaps={overlaps(day.entries)}
      />
    </section>
  )
}
