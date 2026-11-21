import type { Temporal } from 'temporal-polyfill'
import type { Clock } from './clock.ts'
import type { BaseRecord, Instant } from './records.ts'

/** An instant as an ISO 8601 UTC string with milliseconds. */
export function toInstant(instant: Temporal.Instant): Instant {
  return instant.toString({ smallestUnit: 'millisecond' })
}

/** The fields of a new record, stamped with the clock's current moment. */
export function newRecordFields(clock: Clock): BaseRecord {
  const now = toInstant(clock.now())
  return {
    id: crypto.randomUUID(),
    createdAt: now,
    updatedAt: now,
    deleted: false,
  }
}

/** A copy of the record with the changes applied and a new `updatedAt`. */
export function touch<T extends BaseRecord>(
  record: T,
  changes: Partial<NoInfer<T>>,
  clock: Clock,
): T {
  return { ...record, ...changes, updatedAt: toInstant(clock.now()) }
}
