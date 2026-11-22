import type { EntryError } from '../domain/entries.ts'

/** Shown when a time field does not hold a valid time. */
export const INVALID_TIME_MESSAGE = 'Enter a time as HH:MM'

/** The text shown to the user for a rejected entry action. */
export function entryErrorMessage(error: EntryError): string {
  switch (error) {
    case 'end-not-after-start':
      return "End must be after start; an entry can't run past midnight, so split it"
    case 'no-label':
      return 'Pick a label'
    case 'after-today':
      return "Entries can't be after today"
    case 'not-found':
      return 'This entry no longer exists'
  }
}
