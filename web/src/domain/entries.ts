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

/** The date, wall-clock times and time zone of an entry. */
export type TimeRange = Pick<NewEntry, 'date' | 'start' | 'end' | 'timeZone'>

/** Minutes since the start of the day of a wall-clock time. */
function minutesOf(time: Temporal.PlainTime): number {
  return time.hour * 60 + time.minute
}

/** Minutes since the start of the day of a wall-clock end time; an end of 00:00 is 24:00. */
function endMinutesOf(end: Temporal.PlainTime): number {
  return end.equals(MIDNIGHT) ? 24 * 60 : minutesOf(end)
}

/**
 * Whether an end time is after a start time on the clock of one day; an end of 00:00 is 24:00.
 * Clock changes do not matter, so 22:00–00:30 never is.
 */
export function endsAfterStart(
  start: Temporal.PlainTime,
  end: Temporal.PlainTime,
): boolean {
  return endMinutesOf(end) > minutesOf(start)
}

/**
 * Whether the end of a time range is after its start, both on the clock (see `endsAfterStart`) and in real time:
 * on the night the clocks go forward a start in the gap moves on and can pass the end.
 */
export function timesInOrder(range: TimeRange): boolean {
  return endsAfterStart(range.start, range.end) && durationOfRange(range) > 0
}

/** Today's date in a time zone at the given moment. */
export function todayIn(
  now: Temporal.Instant,
  timeZone: string,
): Temporal.PlainDate {
  return now.toZonedDateTimeISO(timeZone).toPlainDate()
}

/** The first rule an entry breaks, or undefined when it is valid. */
function validate(
  entry: NewEntry,
  now: Temporal.Instant,
): EntryError | undefined {
  const { date, labelId, timeZone } = entry
  if (!timesInOrder(entry)) return 'end-not-after-start'
  if (labelId === '') return 'no-label'
  if (Temporal.PlainDate.compare(date, todayIn(now, timeZone)) > 0) {
    return 'after-today'
  }
  return undefined
}

/** A wall-clock time on a date in a zone, with gaps and overlaps resolved as asked. */
function zonedAt(
  date: Temporal.PlainDate,
  time: Temporal.PlainTime,
  timeZone: string,
  disambiguation: 'compatible' | 'earlier' | 'later',
): Temporal.ZonedDateTime {
  return date
    .toPlainDateTime(time)
    .toZonedDateTime(timeZone, { disambiguation })
}

/** The UTC instant of a wall-clock time on a date in a zone; gaps and overlaps resolve as 'compatible'. */
function instantOf(
  date: Temporal.PlainDate,
  time: Temporal.PlainTime,
  timeZone: string,
): string {
  return toInstant(zonedAt(date, time, timeZone, 'compatible').toInstant())
}

/**
 * A note about a time on the night the clocks change: it does not exist and `becomes` the time it is stored as,
 * or it occurs twice and the earlier one is used.
 */
export type ClockChangeNote =
  | { kind: 'skipped'; time: Temporal.PlainTime; becomes: Temporal.PlainTime }
  | { kind: 'repeated'; time: Temporal.PlainTime }

/** The clock-change note for a wall-clock time on a date in a zone, or undefined for a normal time. */
function clockChangeNoteOf(
  date: Temporal.PlainDate,
  time: Temporal.PlainTime,
  timeZone: string,
): ClockChangeNote | undefined {
  const becomes = zonedAt(date, time, timeZone, 'compatible').toPlainTime()
  if (!becomes.equals(time)) return { kind: 'skipped', time, becomes }
  const earlier = zonedAt(date, time, timeZone, 'earlier')
  const later = zonedAt(date, time, timeZone, 'later')
  if (!earlier.toInstant().equals(later.toInstant())) {
    return { kind: 'repeated', time }
  }
  return undefined
}

/**
 * The clock-change notes for the start and then the end of a time range;
 * an end of 00:00 is midnight on the next date and gets no note, nor does an end equal to the start.
 */
export function clockChangeNotes({
  date,
  start,
  end,
  timeZone,
}: TimeRange): ClockChangeNote[] {
  const times =
    end.equals(MIDNIGHT) || end.equals(start) ? [start] : [start, end]
  return times
    .map((time) => clockChangeNoteOf(date, time, timeZone))
    .filter((note) => note !== undefined)
}

/** The start and end instants of an entry; an end of 00:00 is midnight at the end of the day, on the next date. */
function instantsOf({ date, start, end, timeZone }: TimeRange): {
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

/** The whole minutes between two instants. */
function minutesBetween({
  start,
  end,
}: {
  start: string
  end: string
}): number {
  return Temporal.Instant.from(start)
    .until(Temporal.Instant.from(end))
    .total('minutes')
}

/** The duration of an entry in whole minutes, between its start and end instants. */
export function durationOf(entry: Entry): number {
  return minutesBetween(entry)
}

/**
 * The duration in whole minutes an entry with these times would have: the real time between its instants,
 * so an hour less or more on the nights the clocks change.
 */
export function durationOfRange(range: TimeRange): number {
  return minutesBetween(instantsOf(range))
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

/** Orders entries by one of their instants. */
function byInstant(field: 'start' | 'end') {
  return (a: Entry, b: Entry): number =>
    Temporal.Instant.compare(
      Temporal.Instant.from(a[field]),
      Temporal.Instant.from(b[field]),
    )
}

/** Orders entries by their start instant. */
const byStart = byInstant('start')

/** Orders entries by their end instant. */
const byEnd = byInstant('end')

/** Whether one instant is before another. */
function isBefore(a: string, b: string): boolean {
  return (
    Temporal.Instant.compare(
      Temporal.Instant.from(a),
      Temporal.Instant.from(b),
    ) < 0
  )
}

/** Whether, sorted by start, any entry starts before the previous one ends; adjacent entries do not overlap. */
export function overlaps(entries: Entry[]): boolean {
  const sorted = [...entries].sort(byStart)
  return sorted.some(
    (entry, i) => i > 0 && isBefore(entry.start, sorted[i - 1].end),
  )
}

/** Whether two time spans overlap: each starts before the other ends, so adjacent spans do not. */
function spansOverlap(
  a: { start: string; end: string },
  b: { start: string; end: string },
): boolean {
  return isBefore(a.start, b.end) && isBefore(b.start, a.end)
}

/** The ids of the entries that are not deleted and overlap another such entry; adjacent entries do not overlap. */
export function overlappingIds(entries: Entry[]): Set<string> {
  const active = entries.filter((entry) => !entry.deleted)
  return new Set(
    active
      .filter((entry) =>
        active.some(
          (other) => other.id !== entry.id && spansOverlap(entry, other),
        ),
      )
      .map((entry) => entry.id),
  )
}

/** Whether an entry is not deleted and falls on the date. */
export function isActiveOn(entry: Entry, date: Temporal.PlainDate): boolean {
  return !entry.deleted && dateOf(entry).equals(date)
}

/** Entries that are not deleted on the date. */
function activeOn(entries: Entry[], date: Temporal.PlainDate): Entry[] {
  return entries.filter((entry) => isActiveOn(entry, date))
}

/**
 * The entries a time range overlaps, sorted by start: not deleted, not the candidate itself,
 * on the candidate's date, and each starting before the other ends; adjacent entries do not overlap.
 */
export function overlapping(
  candidate: TimeRange & { id?: string | undefined },
  entries: Entry[],
): Entry[] {
  const range = instantsOf(candidate)
  return activeOn(entries, candidate.date)
    .filter((entry) => entry.id !== candidate.id && spansOverlap(entry, range))
    .sort(byStart)
}

/**
 * Where a prefilled start comes from: the end of the previous entry that day,
 * the first start on an earlier date, or the default day start.
 */
export type PrefillSource =
  | { kind: 'previous' }
  | { kind: 'same-as'; date: Temporal.PlainDate }
  | { kind: 'default' }

/** The start and end time a new entry is prefilled with, and where they come from. */
export type Prefill = {
  start: Temporal.PlainTime
  end: Temporal.PlainTime
  source: PrefillSource
}

/** A prefilled start time and where it comes from. */
type SourcedStart = { start: Temporal.PlainTime; source: PrefillSource }

/** Where a day starts when no earlier day has entries. */
const DAY_START = new Temporal.PlainTime(9)

/** The start time of the earliest entry on the date, with the date as its source, or undefined without entries. */
function earliestStartOn(
  date: Temporal.PlainDate,
  entries: Entry[],
): SourcedStart | undefined {
  const earliest = activeOn(entries, date).sort(byStart).at(0)
  return (
    earliest && {
      start: startTimeOf(earliest),
      source: { kind: 'same-as', date },
    }
  )
}

/** The most recent date before the date with entries that are not deleted, or undefined. */
function latestDateBefore(
  date: Temporal.PlainDate,
  entries: Entry[],
): Temporal.PlainDate | undefined {
  return entries
    .filter((entry) => !entry.deleted)
    .map(dateOf)
    .filter((day) => Temporal.PlainDate.compare(day, date) < 0)
    .sort(Temporal.PlainDate.compare)
    .at(-1)
}

/**
 * Where the first entry of a day starts: the first start on the same weekday a week earlier,
 * otherwise on the most recent earlier day with entries, otherwise 09:00.
 */
function firstStartFor(
  date: Temporal.PlainDate,
  entries: Entry[],
): SourcedStart {
  const weekEarlier = earliestStartOn(date.subtract({ days: 7 }), entries)
  if (weekEarlier) return weekEarlier
  const latestDate = latestDateBefore(date, entries)
  const latest = latestDate && earliestStartOn(latestDate, entries)
  return latest ?? { start: DAY_START, source: { kind: 'default' } }
}

/**
 * The times a new entry on the date starts with: the end of the latest entry that day,
 * or for the first entry of a day the start from `firstStartFor`.
 * Undefined when the day already ends at midnight.
 */
export function prefillFor(
  date: Temporal.PlainDate,
  entries: Entry[],
): Prefill | undefined {
  const latest = activeOn(entries, date).sort(byEnd).at(-1)
  if (!latest) {
    const { start, source } = firstStartFor(date, entries)
    return { start, end: start, source }
  }
  const end = endTimeOf(latest)
  if (end.equals(MIDNIGHT)) return undefined
  return { start: end, end, source: { kind: 'previous' } }
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
      return activeOn(all, date).sort(byStart)
    },

    /** The times a new entry on the date is prefilled with; see `prefillFor`. */
    async prefill(date: Temporal.PlainDate): Promise<Prefill | undefined> {
      return prefillFor(date, await entries.all())
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

export type EntryService = ReturnType<typeof createEntryService>
