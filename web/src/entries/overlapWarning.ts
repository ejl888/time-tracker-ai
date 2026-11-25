import { overlapping } from '../domain/entries.ts'
import type { Entry, Label } from '../domain/records.ts'
import type { Day } from './day.ts'
import type { TimesWarning } from './EntryForm.tsx'
import { overlapMessage } from './entryMessages.ts'

/** The name an entry is shown by in a warning: its description, else its label's name. */
function nameOf(entry: Entry, labels: Label[]): string {
  if (entry.description) return entry.description
  const label = labels.find((option) => option.id === entry.labelId)
  return label?.name ?? '(unknown label)'
}

/**
 * Warns which entries of the day a draft's times overlap. The draft is entered in the time zone,
 * and with an id it is that entry, which does not overlap itself.
 */
export function overlapWarning(
  day: Day,
  timeZone: string,
  id?: string,
): TimesWarning {
  return (start, end) => {
    const overlapped = overlapping(
      { date: day.date, start, end, timeZone, id },
      day.entries,
    )
    if (overlapped.length === 0) return undefined
    return overlapMessage(
      overlapped.map((entry) => ({
        entry,
        name: nameOf(entry, day.usedLabels),
      })),
    )
  }
}
