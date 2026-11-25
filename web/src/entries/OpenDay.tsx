import type { Prefill } from '../domain/entries.ts'
import { AddEntryRow } from './AddEntryRow.tsx'
import {
  formatDateHeading,
  formatLongDate,
  formatShortDate,
} from './dateText.ts'
import { workedText } from './day.ts'
import type { DayEntriesProps } from './DayEntries.tsx'
import { DayEntries } from './DayEntries.tsx'
import { DayHead } from './DayHead.tsx'
import { overlapWarning } from './overlapWarning.ts'
import { Timeline } from './Timeline.tsx'

interface OpenDayProps extends DayEntriesProps {
  isToday: boolean
  timeZone: string
  /** The times a new entry is prefilled with. */
  prefill: Prefill | undefined
  /** Whether the add row gets focus. */
  focused: boolean
  /** Called after an entry was added. */
  onAdded: () => void
}

/** The open day: its total, its entries and, while none of them is edited, the row to add one. */
export function OpenDay({
  isToday,
  timeZone,
  prefill,
  focused,
  onAdded,
  ...dayEntries
}: OpenDayProps) {
  const { day, entries, editing } = dayEntries
  return (
    <section className="day active" aria-label={formatLongDate(day.date)}>
      <DayHead
        name={
          <h3 className="day-name" aria-label={formatDateHeading(day.date)}>
            {formatShortDate(day.date)}
          </h3>
        }
        isToday={isToday}
        total={workedText(day)}
      />
      <Timeline day={day} scale />
      <DayEntries {...dayEntries} />
      {editing === undefined && (
        <AddEntryRow
          entries={entries}
          date={day.date}
          labels={day.labels}
          timeZone={timeZone}
          prefill={prefill}
          focused={focused}
          warn={overlapWarning(day, timeZone)}
          onAdded={onAdded}
        />
      )}
    </section>
  )
}
