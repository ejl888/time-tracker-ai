import { Temporal } from 'temporal-polyfill'
import { billedMinutes, isWithin } from './contracts.ts'
import type { Period } from './contracts.ts'
import { dateOf, durationOf } from './entries.ts'
import type { Contract, Entry, ExpectedHours, Label } from './records.ts'
import { billableLabelIds } from './workedHours.ts'

/** Worked minutes, split by whether the label is billable. */
export interface WorkedMinutes {
  billable: number
  nonBillable: number
}

/** The total duration of the entries in whole minutes. */
function totalMinutes(entries: Entry[]): number {
  return entries.reduce((total, entry) => total + durationOf(entry), 0)
}

/** The worked minutes from the start up to and including the end; deleted entries are skipped. */
function workedWithin(
  range: Pick<Period, 'start' | 'end'>,
  entries: Entry[],
  labels: Label[],
): WorkedMinutes {
  const worked = entries.filter(
    (entry) => !entry.deleted && isWithin(dateOf(entry), range),
  )
  const billableIds = billableLabelIds(labels)
  const billable = totalMinutes(
    worked.filter((entry) => billableIds.has(entry.labelId)),
  )
  return { billable, nonBillable: totalMinutes(worked) - billable }
}

/**
 * The worked minutes of the period; days before the contract start do not count.
 * Expects the labels the entries use, deleted ones included, as those still count with their
 * billable setting. Deleted entries are skipped.
 */
export function workedInPeriod(
  contract: Pick<Contract, 'startDate'>,
  period: Period,
  entries: Entry[],
  labels: Label[],
): WorkedMinutes {
  const contractStart = Temporal.PlainDate.from(contract.startDate)
  const start =
    Temporal.PlainDate.compare(contractStart, period.start) > 0
      ? contractStart
      : period.start
  return workedWithin({ start, end: period.end }, entries, labels)
}

/** The billed minutes of all periods before the period; deleted expected hours are skipped. */
function billedBefore(
  limit: number,
  period: Period,
  expected: ExpectedHours[],
): number {
  return expected
    .filter(
      (record) =>
        !record.deleted &&
        Temporal.PlainDate.compare(record.periodStart, period.start) < 0,
    )
    .reduce((total, record) => total + billedMinutes(limit, record.expected), 0)
}

/**
 * The balance in minutes carried into the period: the starting balance plus the billable
 * worked minutes since the contract start, minus the billed minutes of earlier periods.
 * Expects the expected hours of this contract, all entries before the period, and labels as in
 * `workedInPeriod`.
 */
export function balanceBefore(
  contract: Pick<Contract, 'startDate' | 'billableLimit' | 'startingBalance'>,
  period: Period,
  expected: ExpectedHours[],
  entries: Entry[],
  labels: Label[],
): number {
  const earlier = {
    start: Temporal.PlainDate.from(contract.startDate),
    end: period.start.subtract({ days: 1 }),
  }
  const worked = workedWithin(earlier, entries, labels).billable
  const billed = billedBefore(contract.billableLimit, period, expected)
  return balanceAfter(contract.startingBalance, worked, billed)
}

/** The balance after working and billing these minutes. */
export function balanceAfter(
  before: number,
  worked: number,
  billed: number,
): number {
  return before + worked - billed
}

/** The minutes left to work to reach the billed minutes; negative when more is worked. */
export function hoursLeft(billed: number, worked: number): number {
  return billed - worked
}

/** What a period comes to, in minutes. */
export interface PeriodResult {
  billed: number
  left: number
  balanceAfter: number
}

/** What a period comes to with these expected minutes, balance carried in and billable worked minutes. */
export function periodResult(
  limit: number,
  expected: number | undefined,
  balanceIn: number,
  worked: number,
): PeriodResult {
  const billed = billedMinutes(limit, expected)
  return {
    billed,
    left: hoursLeft(billed, worked),
    balanceAfter: balanceAfter(balanceIn, worked, billed),
  }
}
