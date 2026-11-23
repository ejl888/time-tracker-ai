import { Temporal } from 'temporal-polyfill'

export type BillingCycle = 'week' | 'month'

/** A billing period: first and last day, plus the ISO week number for weeks. */
export interface Period {
  start: Temporal.PlainDate
  end: Temporal.PlainDate
  week?: number
}

/** The week (Monday–Sunday) or calendar month that contains the date. */
export function periodOf(
  date: Temporal.PlainDate,
  cycle: BillingCycle,
): Period {
  if (cycle === 'month') {
    const start = date.with({ day: 1 })
    return { start, end: date.with({ day: date.daysInMonth }) }
  }
  const start = date.subtract({ days: date.dayOfWeek - 1 })
  return { start, end: start.add({ days: 6 }), week: date.weekOfYear }
}

/** Billed minutes of a period: the expected minutes capped at the limit; nothing entered is 0. */
export function billedMinutes(
  limit: number,
  expected: number | undefined,
): number {
  return Math.min(limit, expected ?? 0)
}
