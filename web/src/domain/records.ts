/** An instant in UTC, ISO 8601 with milliseconds, e.g. "2026-11-18T08:00:00.000Z". */
export type Instant = string

/** Fields every record has; see docs/data-model.md. */
export interface BaseRecord {
  id: string
  createdAt: Instant
  updatedAt: Instant
  deleted: boolean
}

export interface Label extends BaseRecord {
  name: string
  billable: boolean
}

export interface Entry extends BaseRecord {
  start: Instant
  end: Instant
  /** IANA time zone the entry was entered in. */
  timeZone: string
  description: string
  labelId: string
}

/** An ISO 8601 calendar date, e.g. "2026-11-18". */
export type IsoDate = string

export interface Contract extends BaseRecord {
  startDate: IsoDate
  /** Last day of the contract; null while it is ongoing. */
  endDate: IsoDate | null
  billingCycle: 'week' | 'month'
  /** Maximum billed minutes per period. */
  billableLimit: number
  /** Minutes; may be negative. */
  startingBalance: number
}

export interface ExpectedHours extends BaseRecord {
  contractId: string
  /** Monday of the week or first day of the month, matching the contract's billing cycle. */
  periodStart: IsoDate
  /** Expected billable minutes for the period. */
  expected: number
}
