import { Temporal } from 'temporal-polyfill'
import { isWithin, periodOf } from './contracts.ts'
import type { BillingCycle, Period } from './contracts.ts'
import type { Contract } from './records.ts'

/** The earliest of the dates. */
function earliestOf(
  first: Temporal.PlainDate,
  ...others: Temporal.PlainDate[]
): Temporal.PlainDate {
  return others.reduce(
    (a, b) => (Temporal.PlainDate.compare(b, a) < 0 ? b : a),
    first,
  )
}

/** The days of the period up to and including today, newest first. */
export function daysShown(
  period: Period,
  today: Temporal.PlainDate,
): Temporal.PlainDate[] {
  const newest = earliestOf(period.end, today)
  const count = period.start.until(newest).days + 1
  return Array.from({ length: Math.max(0, count) }, (_, n) =>
    newest.subtract({ days: n }),
  )
}

/** The day the period opens on: today, or in another period its last workday (Monday to Friday). */
export function openDay(
  period: Period,
  today: Temporal.PlainDate,
): Temporal.PlainDate {
  if (isWithin(today, period)) return today
  const daysAfterFriday = Math.max(0, period.end.dayOfWeek - 5)
  return period.end.subtract({ days: daysAfterFriday })
}

/** The period `n` periods later, or earlier when `n` is negative. */
export function shiftPeriod(
  period: Period,
  cycle: BillingCycle,
  n: number,
): Period {
  const shift = cycle === 'month' ? { months: n } : { weeks: n }
  return periodOf(period.start.add(shift), cycle)
}

/** The cycle of the periods shown: that of the contract, or weeks without one. */
export function overviewCycle(
  contract: Pick<Contract, 'billingCycle'> | undefined,
): BillingCycle {
  return contract?.billingCycle ?? 'week'
}

/**
 * The first period that can be shown: the one that holds the contract start or the earliest entry,
 * whichever is first, but never after the current period.
 */
export function firstPeriod(
  contract: Pick<Contract, 'startDate' | 'billingCycle'> | undefined,
  earliestEntry: Temporal.PlainDate | undefined,
  today: Temporal.PlainDate,
): Period {
  const first = earliestOf(
    today,
    contract ? Temporal.PlainDate.from(contract.startDate) : today,
    earliestEntry ?? today,
  )
  return periodOf(first, overviewCycle(contract))
}

/** Whether there is a period before this one to go to. */
export function canGoBack(period: Period, first: Period): boolean {
  return Temporal.PlainDate.compare(period.start, first.start) > 0
}

/** Whether there is a period after this one to go to: the current period is the last. */
export function canGoForward(
  period: Period,
  today: Temporal.PlainDate,
): boolean {
  return Temporal.PlainDate.compare(period.end, today) < 0
}
