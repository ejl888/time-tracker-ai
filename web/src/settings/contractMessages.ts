import type { ContractError } from '../domain/contracts.ts'

/** Shown when an hours field does not hold whole hours or H:MM. */
export const INVALID_HOURS_MESSAGE = 'Use hours like 36 or 36:00'

/** Shown next to the fields that can no longer change. */
export const LOCKED_MESSAGE =
  'Locked: expected hours are entered for this contract'

/** The text shown to the user for a rejected contract action. */
export function contractErrorMessage(error: ContractError): string {
  switch (error) {
    case 'limit-not-positive':
      return 'The billable limit must be more than 0:00'
    case 'contract-locked':
      return 'Billing cycle, start and limit are locked: expected hours are entered for this contract'
    case 'negative':
      return 'Hours cannot be negative'
    case 'not-a-period-start':
      return 'Expected hours belong to the first day of a period'
  }
}
