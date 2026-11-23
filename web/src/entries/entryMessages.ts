import type { EntryError } from '../domain/entries.ts'
import { endTimeOf, startTimeOf } from '../domain/entries.ts'
import type { Entry } from '../domain/records.ts'
import { formatEndTime, formatTime } from '../domain/timeText.ts'

/** Shown when a time field does not hold a valid time. */
export const INVALID_TIME_MESSAGE = 'Enter a time as HH:MM'

/** The text shown to the user for a rejected entry action. */
export function entryErrorMessage(error: EntryError): string {
  switch (error) {
    case 'end-not-after-start':
      return "End must be after start; an entry can't run past midnight, so split it"
    case 'no-label':
      return 'Pick a label'
    case 'after-today':
      return "Entries can't be after today"
    case 'not-found':
      return 'This entry no longer exists'
  }
}

/** The times of an entry in its own time zone, e.g. "09:00–10:30"; midnight as an end is 24:00. */
export function timeRangeText(entry: Entry): string {
  return `${formatTime(startTimeOf(entry))}–${formatEndTime(endTimeOf(entry))}`
}

/** The warning that a draft overlaps these entries, each with the name it is shown by, in the given order. */
export function overlapMessage(
  overlapped: { entry: Entry; name: string }[],
): string {
  const names = overlapped
    .map(({ entry, name }) => `“${name}” ${timeRangeText(entry)}`)
    .join(', ')
  return `Overlaps with ${names}. You can still save.`
}
