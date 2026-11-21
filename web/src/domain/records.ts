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
