import { Temporal } from 'temporal-polyfill'
import { durationOf, isActiveOn } from './entries.ts'
import type { Entry, Label } from './records.ts'

export { formatMinutes } from './timeText.ts'

/** The ids of the billable labels, deleted ones included. */
export function billableLabelIds(labels: Label[]): Set<string> {
  return new Set(
    labels.filter((label) => label.billable).map((label) => label.id),
  )
}

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
  const billable = billableLabelIds(labels)
  return entries
    .filter((entry) => isActiveOn(entry, date) && billable.has(entry.labelId))
    .reduce((total, entry) => total + durationOf(entry), 0)
}
