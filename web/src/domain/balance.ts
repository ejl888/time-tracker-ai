import { Temporal } from 'temporal-polyfill'
import type { Period } from './contracts.ts'
import { dateOf, durationOf } from './entries.ts'
import type { Contract, Entry, Label } from './records.ts'
import { billableLabelIds } from './workedHours.ts'

/** Worked minutes, split by whether the label is billable. */
export interface WorkedMinutes {
  billable: number
  nonBillable: number
}

/** Whether the date is from the start up to and including the end. */
function isWithin(
  date: Temporal.PlainDate,
  { start, end }: Pick<Period, 'start' | 'end'>,
): boolean {
  return (
    Temporal.PlainDate.compare(date, start) >= 0 &&
    Temporal.PlainDate.compare(date, end) <= 0
  )
}

/** The total duration of the entries in whole minutes. */
function totalMinutes(entries: Entry[]): number {
  return entries.reduce((total, entry) => total + durationOf(entry), 0)
}

/**
 * The worked minutes of the period; days before the contract start do not count.
 * Expects all records, deleted ones included: deleted entries are skipped,
 * a deleted label still counts with its billable setting.
 */
export function workedInPeriod(
  contract: Pick<Contract, 'startDate'>,
  period: Period,
  entries: Entry[],
  labels: Label[],
): WorkedMinutes {
  const contractStart = Temporal.PlainDate.from(contract.startDate)
  const worked = entries.filter((entry) => {
    if (entry.deleted) return false
    const date = dateOf(entry)
    return (
      isWithin(date, period) &&
      Temporal.PlainDate.compare(date, contractStart) >= 0
    )
  })
  const billableIds = billableLabelIds(labels)
  const billable = totalMinutes(
    worked.filter((entry) => billableIds.has(entry.labelId)),
  )
  return { billable, nonBillable: totalMinutes(worked) - billable }
}
