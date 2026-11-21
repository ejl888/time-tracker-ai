import { Temporal } from 'temporal-polyfill'
import type { Clock } from './clock.ts'
import type { Entry } from './records.ts'
import type { Repository } from './repository.ts'
import type { Result } from './result.ts'
import { newRecordFields, toInstant, touch } from './recordFields.ts'

export type EntryError = 'not-found'

export interface NewEntry {
  date: Temporal.PlainDate
  start: Temporal.PlainTime
  end: Temporal.PlainTime
  labelId: string
  description: string
  /** IANA time zone the date and times are in. */
  timeZone: string
}

/** The UTC instant of a wall-clock time on a date in a zone; gaps and overlaps resolve as 'compatible'. */
function instantOf(
  date: Temporal.PlainDate,
  time: Temporal.PlainTime,
  timeZone: string,
): string {
  const zoned = date.toPlainDateTime(time).toZonedDateTime(timeZone, {
    disambiguation: 'compatible',
  })
  return toInstant(zoned.toInstant())
}

/** The date of an entry: the local date of its start in its own time zone. */
export function dateOf(entry: Entry): Temporal.PlainDate {
  return Temporal.Instant.from(entry.start)
    .toZonedDateTimeISO(entry.timeZone)
    .toPlainDate()
}

/** The duration of an entry in whole minutes, between its start and end instants. */
export function durationOf(entry: Entry): number {
  return Temporal.Instant.from(entry.start)
    .until(Temporal.Instant.from(entry.end))
    .total('minutes')
}

/** The start of an entry as a wall-clock time in its own time zone. */
export function startTimeOf(entry: Entry): Temporal.PlainTime {
  return Temporal.Instant.from(entry.start)
    .toZonedDateTimeISO(entry.timeZone)
    .toPlainTime()
}

/** Whether an entry is not deleted and falls on the date. */
export function isActiveOn(entry: Entry, date: Temporal.PlainDate): boolean {
  return !entry.deleted && dateOf(entry).equals(date)
}

export function createEntryService(entries: Repository<Entry>, clock: Clock) {
  return {
    async add({
      date,
      start,
      end,
      labelId,
      description,
      timeZone,
    }: NewEntry): Promise<Result<Entry, EntryError>> {
      const entry: Entry = {
        ...newRecordFields(clock),
        start: instantOf(date, start, timeZone),
        end: instantOf(date, end, timeZone),
        timeZone,
        description,
        labelId,
      }
      await entries.save(entry)
      return { ok: true, value: entry }
    },

    /** Entries that are not deleted on the date, sorted by start. */
    async on(date: Temporal.PlainDate): Promise<Entry[]> {
      const all = await entries.all()
      return all
        .filter((entry) => isActiveOn(entry, date))
        .sort((a, b) =>
          Temporal.Instant.compare(
            Temporal.Instant.from(a.start),
            Temporal.Instant.from(b.start),
          ),
        )
    },

    /** Soft-deletes an entry that is not deleted yet. */
    async remove(id: string): Promise<Result<Entry, EntryError>> {
      const entry = await entries.get(id)
      if (!entry || entry.deleted) return { ok: false, error: 'not-found' }
      const removed = touch(entry, { deleted: true }, clock)
      await entries.save(removed)
      return { ok: true, value: removed }
    },
  }
}
