import type { BillingCycle, Period } from '../domain/contracts.ts'
import { formatMinutes } from '../domain/timeText.ts'
import {
  formatDateRange,
  formatMonthYear,
  formatShortDateRange,
} from './dateText.ts'

/** Shown in the summary when no contract is set up. */
export const NO_CONTRACT_MESSAGE = 'Set up your contract in Settings'

/** Shown in the summary when the shown period ends before the contract start. */
export const BEFORE_CONTRACT_MESSAGE = 'Before your contract starts'

/**
 * The title of a period with the line under it: "Week 48" and its days, or the month. On phones the
 * short text follows the title instead, if any.
 */
export function periodTitle(
  period: Period,
  cycle: BillingCycle,
): { title: string; sub: string; short: string | undefined } {
  if (cycle === 'month') {
    return {
      title: formatMonthYear(period.start),
      sub: 'Monthly billing period',
      short: undefined,
    }
  }
  return {
    title: `Week ${period.week}`,
    sub: formatDateRange(period.start, period.end),
    short: `· ${formatShortDateRange(period.start, period.end)}`,
  }
}

/** Whether the expected minutes are above the limit. */
export function isCapped(limit: number, expected: number | undefined): boolean {
  return expected !== undefined && expected > limit
}

/** The note under Expected: when to enter it, the limit, or that it is capped by the limit. */
export function expectedNote(
  cycle: BillingCycle,
  limit: number,
  expected: number | undefined,
): string {
  if (expected === undefined) return `Enter at the start of the ${cycle}`
  if (isCapped(limit, expected))
    return `Capped at ${formatMinutes(limit)} by contract`
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

/** The note under Left: what it is the rest of, or by how much that is exceeded; `left` is then negative. */
export function leftNote(
  limit: number,
  expected: number | undefined,
  left: number,
): string {
  if (expected === undefined) return 'Enter expected hours first'
  const capped = isCapped(limit, expected)
  if (left < 0) {
    return `${formatMinutes(-left)} more than ${capped ? 'the limit' : 'expected'}`
  }
  return capped ? 'Limit minus worked' : 'Expected minus worked'
}

/** The tooltip of Balance after. */
export function balanceAfterTitle(cycle: BillingCycle): string {
  return `Balance after ${cycle}`
}

/** The note under Balance after. */
export function balanceAfterNote(balance: number): string {
  if (balance === 0) return 'Nothing to carry over'
  return balance > 0 ? 'Hours built up' : 'Hours still to work'
}

/** The note under Worked: the non-billable minutes that are not in it, if any. */
export function workedNote(nonBillable: number): string {
  if (nonBillable === 0) return 'Billable labels only'
  return `+ ${formatMinutes(nonBillable)} non-billable`
}
