import { Temporal } from 'temporal-polyfill'
import type { Clock } from './clock.ts'
import type { Entry } from './records.ts'
import type { Repository } from './repository.ts'
import type { Result } from './result.ts'
import { newRecordFields, toInstant, touch } from './recordFields.ts'
import { MIDNIGHT } from './timeText.ts'

export type EntryError =
  'end-not-after-start' | 'no-label' | 'after-today' | 'not-found'

export interface NewEntry {
  date: Temporal.PlainDate
  start: Temporal.PlainTime
  end: Temporal.PlainTime
  labelId: string
  description: string
  /** IANA time zone the date and times are in. */
  timeZone: string
}

/** The fields of an entry that can be changed. */
export type EntryChanges = Partial<
  Pick<NewEntry, 'start' | 'end' | 'labelId' | 'description'>
>

/** Minutes since the start of the day of a wall-clock end time; an end of 00:00 is 24:00. */
function endMinutesOf(end: Temporal.PlainTime): number {
  return end.equals(MIDNIGHT) ? 24 * 60 : end.hour * 60 + end.minute
}

/** Today's date in a time zone at the given moment. */
export function todayIn(
  now: Temporal.Instant,
  timeZone: string,
): Temporal.PlainDate {
  return now.toZonedDateTimeISO(timeZone).toPlainDate()
}

/**
 * The first rule an entry breaks, or undefined when it is valid.
 * Times are compared as wall-clock times, so clock changes do not matter.
 */
function validate(
  { date, start, end, labelId, timeZone }: NewEntry,
  now: Temporal.Instant,
): EntryError | undefined {
  if (endMinutesOf(end) <= start.hour * 60 + start.minute) {
    return 'end-not-after-start'
  }
  if (labelId === '') return 'no-label'
  if (Temporal.PlainDate.compare(date, todayIn(now, timeZone)) > 0) {
    return 'after-today'
  }
  return undefined
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

/** The start and end instants of an entry; an end of 00:00 is midnight at the end of the day, on the next date. */
function instantsOf({ date, start, end, timeZone }: NewEntry): {
  start: string
  end: string
} {
  const endDate = end.equals(MIDNIGHT) ? date.add({ days: 1 }) : date
  return {
    start: instantOf(date, start, timeZone),
    end: instantOf(endDate, end, timeZone),
  }
}

/** A stored UTC instant of an entry as a date and time in the entry's own time zone. */
function zonedOf(entry: Entry, instant: string): Temporal.ZonedDateTime {
  return Temporal.Instant.from(instant).toZonedDateTimeISO(entry.timeZone)
}

/** The date of an entry: the local date of its start in its own time zone. */
export function dateOf(entry: Entry): Temporal.PlainDate {
  return zonedOf(entry, entry.start).toPlainDate()
}

/** The duration of an entry in whole minutes, between its start and end instants. */
export function durationOf(entry: Entry): number {
  return Temporal.Instant.from(entry.start)
    .until(Temporal.Instant.from(entry.end))
    .total('minutes')
}

/** The start of an entry as a wall-clock time in its own time zone. */
export function startTimeOf(entry: Entry): Temporal.PlainTime {
  return zonedOf(entry, entry.start).toPlainTime()
}

/** The end of an entry as a wall-clock time in its own time zone; midnight is 00:00. */
export function endTimeOf(entry: Entry): Temporal.PlainTime {
  return zonedOf(entry, entry.end).toPlainTime()
}

/** An entry as the input it was made from, in its own time zone. */
function inputOf(entry: Entry): NewEntry {
  return {
    date: dateOf(entry),
    start: startTimeOf(entry),
    end: endTimeOf(entry),
    labelId: entry.labelId,
    description: entry.description,
    timeZone: entry.timeZone,
  }
}

/** Orders entries by their start instant. */
function byStart(a: Entry, b: Entry): number {
  return Temporal.Instant.compare(
    Temporal.Instant.from(a.start),
    Temporal.Instant.from(b.start),
  )
}

/** Whether, sorted by start, any entry starts before the previous one ends; adjacent entries do not overlap. */
export function overlaps(entries: Entry[]): boolean {
  const sorted = [...entries].sort(byStart)
  return sorted.some(
    (entry, i) =>
      i > 0 &&
      Temporal.Instant.compare(
        Temporal.Instant.from(entry.start),
        Temporal.Instant.from(sorted[i - 1].end),
      ) < 0,
  )
}

/** Whether an entry is not deleted and falls on the date. */
export function isActiveOn(entry: Entry, date: Temporal.PlainDate): boolean {
  return !entry.deleted && dateOf(entry).equals(date)
}

export function createEntryService(entries: Repository<Entry>, clock: Clock) {
  return {
    async add(newEntry: NewEntry): Promise<Result<Entry, EntryError>> {
      const error = validate(newEntry, clock.now())
      if (error) return { ok: false, error }
      const { labelId, description, timeZone } = newEntry
      const entry: Entry = {
        ...newRecordFields(clock),
        ...instantsOf(newEntry),
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
      return all.filter((entry) => isActiveOn(entry, date)).sort(byStart)
    },

    /** Changes an entry that is not deleted; an update that changes nothing is not saved. */
    async update(
      id: string,
      changes: EntryChanges,
    ): Promise<Result<Entry, EntryError>> {
      const entry = await entries.get(id)
      if (!entry || entry.deleted) return { ok: false, error: 'not-found' }
      const input = { ...inputOf(entry), ...changes }
      const error = validate(input, clock.now())
      if (error) return { ok: false, error }
      const fields = {
        ...instantsOf(input),
        labelId: input.labelId,
        description: input.description,
      }
      const unchanged =
        fields.start === entry.start &&
        fields.end === entry.end &&
        fields.labelId === entry.labelId &&
        fields.description === entry.description
      if (unchanged) return { ok: true, value: entry }
      const updated = touch(entry, fields, clock)
      await entries.save(updated)
      return { ok: true, value: updated }
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
