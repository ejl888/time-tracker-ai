import { useEffect, useState } from 'react'
import { Temporal } from 'temporal-polyfill'
import type { Clock } from '../domain/clock.ts'
import type { EntryService } from '../domain/entries.ts'
import { overlaps, todayIn } from '../domain/entries.ts'
import type { LabelService } from '../domain/labels.ts'
import type { Entry, Label } from '../domain/records.ts'
import { formatMinutes, workedMinutesOn } from '../domain/workedHours.ts'
import { AddEntryRow } from './AddEntryRow.tsx'
import { EntryRow } from './EntryRow.tsx'

interface EntriesPageProps {
  entries: EntryService
  labels: LabelService
  clock: Clock
  timeZone: string
}

/** The entries of one date with the labels to show them. */
interface Day {
  date: Temporal.PlainDate
  entries: Entry[]
  /** Labels that are not deleted, to pick from. */
  labels: Label[]
  /** The labels the entries use, deleted ones included. */
  usedLabels: Label[]
}

/** A date in English, e.g. "Wednesday 18 November 2026", built from parts so no comma appears. */
function formatDateHeading(date: Temporal.PlainDate): string {
  const weekday = date.toLocaleString('en-GB', { weekday: 'long' })
  const month = date.toLocaleString('en-GB', { month: 'long' })
  return `${weekday} ${date.day} ${month} ${date.year}`
}

/** Loads the entries of a date and the labels they use. */
async function loadDay(
  date: Temporal.PlainDate,
  entries: EntryService,
  labels: LabelService,
): Promise<Day> {
  const [dayEntries, active] = await Promise.all([
    entries.on(date),
    labels.list(),
  ])
  const usedLabels = await labels.usedBy(dayEntries)
  return { date, entries: dayEntries, labels: active, usedLabels }
}

/** The entries of one day, today by default, with buttons to go to other days. */
export function EntriesPage({
  entries,
  labels,
  clock,
  timeZone,
}: EntriesPageProps) {
  const today = todayIn(clock.now(), timeZone)
  const [date, setDate] = useState(today)
  const [day, setDay] = useState<Day>()

  useEffect(() => {
    let current = true
    void loadDay(date, entries, labels).then((loaded) => {
      if (current) setDay(loaded)
    })
    return () => {
      current = false
    }
  }, [date, entries, labels])

  /** Loads the shown date again, e.g. after an entry was added. */
  async function reload() {
    setDay(await loadDay(date, entries, labels))
  }

  const isToday = date.equals(today)
  const shown = day?.date.equals(date) ? day : undefined

  return (
    <section>
      <h2>Entries</h2>
      <h3>{formatDateHeading(date)}</h3>
      <button type="button" onClick={() => setDate(date.subtract({ days: 1 }))}>
        Previous day
      </button>
      <button
        type="button"
        disabled={isToday}
        onClick={() => setDate(date.add({ days: 1 }))}
      >
        Next day
      </button>
      <button type="button" onClick={() => setDate(today)}>
        Today
      </button>
      {shown && (
        <>
          <DayEntries day={shown} />
          <AddEntryRow
            entries={entries}
            date={shown.date}
            labels={shown.labels}
            timeZone={timeZone}
            onAdded={() => void reload()}
          />
        </>
      )}
    </section>
  )
}

/** The worked hours, overlap warning and list of a loaded day. */
function DayEntries({ day }: { day: Day }) {
  const worked = workedMinutesOn(day.date, day.entries, day.usedLabels)
  const labelOf = (entry: Entry) =>
    day.usedLabels.find((label) => label.id === entry.labelId)

  return (
    <>
      <p>{`Worked ${formatMinutes(worked)}`}</p>
      {overlaps(day.entries) && <p role="status">Some entries overlap</p>}
      {day.entries.length === 0 ? (
        <p>No entries</p>
      ) : (
        <ul aria-label="Entries">
          {day.entries.map((entry) => (
            <EntryRow
              key={entry.id}
              entry={entry}
              labels={day.labels}
              label={labelOf(entry)}
            />
          ))}
        </ul>
      )}
    </>
  )
}
