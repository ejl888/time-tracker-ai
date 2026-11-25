import type { BillingCycle, Period } from '../domain/contracts.ts'
import { formatMinutes } from '../domain/timeText.ts'
import { formatDateRange, formatMonthYear } from './dateText.ts'

/** Shown in the summary when no contract is set up. */
export const NO_CONTRACT_MESSAGE = 'Set up your contract in Settings'

/** Shown in the summary when the shown period ends before the contract start. */
export const BEFORE_CONTRACT_MESSAGE = 'Before your contract starts'

/** The title of a period with the line under it: "Week 48" and its days, or the month. */
export function periodTitle(
  period: Period,
  cycle: BillingCycle,
): { title: string; sub: string } {
  if (cycle === 'month') {
    return {
      title: formatMonthYear(period.start),
      sub: 'Monthly billing period',
    }
  }
  return {
    title: `Week ${period.week}`,
    sub: formatDateRange(period.start, period.end),
  }
}

/** The note under Expected: when to enter it, the limit, or that it is capped by the limit. */
export function expectedNote(
  cycle: BillingCycle,
  limit: number,
  expected: number | undefined,
): string {
  if (expected === undefined) return `Enter at the start of the ${cycle}`
  if (expected > limit) return `Capped at ${formatMinutes(limit)} by contract`
  return `Limit ${formatMinutes(limit)}`
}

/** The tooltip of Balance in. */
export function balanceInTitle(cycle: BillingCycle): string {
  return `Balance carried in from earlier ${cycle}s`
}

/** The note under Balance in. */
export function balanceInNote(cycle: BillingCycle): string {
  return `From earlier ${cycle}s`
}

/** The note under Worked: the non-billable minutes that are not in it, if any. */
export function workedNote(nonBillable: number): string {
  if (nonBillable === 0) return 'Billable labels only'
  return `+ ${formatMinutes(nonBillable)} non-billable`
}
