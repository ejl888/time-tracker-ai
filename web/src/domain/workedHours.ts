import { Temporal } from 'temporal-polyfill'
import { durationOf, isActiveOn } from './entries.ts'
import type { Entry, Label } from './records.ts'

export { formatMinutes } from './timeText.ts'

/**
 * Total minutes of the entries on the date with a billable label.
 * Expects all records, deleted ones included: deleted entries are skipped,
 * a deleted label still counts with its billable setting.
 */
export function workedMinutesOn(
  date: Temporal.PlainDate,
  entries: Entry[],
  labels: Label[],
): number {
  const billable = new Set(
    labels.filter((label) => label.billable).map((label) => label.id),
  )
  return entries
    .filter((entry) => isActiveOn(entry, date) && billable.has(entry.labelId))
    .reduce((total, entry) => total + durationOf(entry), 0)
}
