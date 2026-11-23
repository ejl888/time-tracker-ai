import { useEffect, useState } from 'react'
import { Temporal } from 'temporal-polyfill'
import type { Clock } from '../domain/clock.ts'
import type { EntryService, Prefill } from '../domain/entries.ts'
import { overlapping, overlaps, todayIn } from '../domain/entries.ts'
import type { LabelService } from '../domain/labels.ts'
import type { Entry, Label } from '../domain/records.ts'
import { formatMinutes, workedMinutesOn } from '../domain/workedHours.ts'
import { AddEntryRow } from './AddEntryRow.tsx'
import { EntryEditor } from './EntryEditor.tsx'
import type { TimesWarning } from './EntryForm.tsx'
import { EntryRow } from './EntryRow.tsx'
import { overlapMessage } from './entryMessages.ts'
import './entries.css'

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
  /** The times a new entry on the date is prefilled with. */
  prefill: Prefill | undefined
}

/** A date in English, e.g. "Wednesday 18 November 2026", built from parts so no comma appears. */
function formatDateHeading(date: Temporal.PlainDate): string {
  const weekday = date.toLocaleString('en-GB', { weekday: 'long' })
  const month = date.toLocaleString('en-GB', { month: 'long' })
  return `${weekday} ${date.day} ${month} ${date.year}`
}

/** The name an entry is shown by in a warning: its description, else its label's name. */
function nameOf(entry: Entry, labels: Label[]): string {
  if (entry.description) return entry.description
  const label = labels.find((option) => option.id === entry.labelId)
  return label?.name ?? '(unknown label)'
}

/**
 * Warns which entries of the day a draft's times overlap. The draft is entered in the time zone,
 * and with an id it is that entry, which does not overlap itself.
 */
function overlapWarning(day: Day, timeZone: string, id?: string): TimesWarning {
  return (start, end) => {
    const overlapped = overlapping(
      { date: day.date, start, end, timeZone, id },
      day.entries,
    )
    if (overlapped.length === 0) return undefined
    return overlapMessage(
      overlapped.map((entry) => ({
        entry,
        name: nameOf(entry, day.usedLabels),
      })),
    )
  }
}

/** Loads the entries of a date, the labels they use and the prefill for a new entry. */
async function loadDay(
  date: Temporal.PlainDate,
  entries: EntryService,
  labels: LabelService,
): Promise<Day> {
  const [dayEntries, active, prefill] = await Promise.all([
    entries.on(date),
    labels.list(),
    entries.prefill(date),
  ])
  const usedLabels = await labels.usedBy(dayEntries)
  return { date, entries: dayEntries, labels: active, usedLabels, prefill }
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
  // The id of the entry whose editor is open; at most one is open at a time.
  const [editing, setEditing] = useState<string>()

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

  /** Shows another date, closing any open editor. */
  function goTo(other: Temporal.PlainDate) {
    setEditing(undefined)
    setDate(other)
  }

  /** Closes the editor after its entry was saved or deleted and shows the saved day. */
  async function closeEditor() {
    await reload()
    setEditing(undefined)
  }

  const isToday = date.equals(today)
  const shown = day?.date.equals(date) ? day : undefined

  return (
    <section className="entries-page">
      <h2 className="page-title">Entries</h2>
      <div className="period-bar">
        <div className="period-nav">
          <button
            className="icon-btn"
            type="button"
            aria-label="Previous day"
            onClick={() => goTo(date.subtract({ days: 1 }))}
          >
            ‹
          </button>
          <h3 className="period-title">{formatDateHeading(date)}</h3>
          <button
            className="icon-btn"
            type="button"
            aria-label="Next day"
            disabled={isToday}
            onClick={() => goTo(date.add({ days: 1 }))}
          >
            ›
          </button>
        </div>
        <span className="spacer" />
        <button className="btn" type="button" onClick={() => goTo(today)}>
          Today
        </button>
      </div>
      {shown && (
        <div className="day active">
          <DayEntries
            day={shown}
            entries={entries}
            editing={editing}
            onEdit={setEditing}
            onEdited={() => void closeEditor()}
          />
          {editing === undefined && (
            <AddEntryRow
              entries={entries}
              date={shown.date}
              labels={shown.labels}
              timeZone={timeZone}
              prefill={shown.prefill}
              warn={overlapWarning(shown, timeZone)}
              onAdded={() => void reload()}
            />
          )}
        </div>
      )}
    </section>
  )
}

interface DayEntriesProps {
  day: Day
  entries: EntryService
  /** The id of the entry whose editor is open, if any. */
  editing: string | undefined
  /** Opens the editor of an entry, or closes it with undefined, discarding its changes. */
  onEdit: (id: string | undefined) => void
  /** Called after the open entry was saved or deleted. */
  onEdited: () => void
}

/** Whether an entry overlaps another of the entries. */
function overlapsAnother(entry: Entry, entries: Entry[]): boolean {
  return entries.some(
    (other) => other.id !== entry.id && overlaps([entry, other]),
  )
}

/** The worked hours, overlap warning and list of a loaded day, with the open entry as an editor. */
function DayEntries({
  day,
  entries,
  editing,
  onEdit,
  onEdited,
}: DayEntriesProps) {
  const worked = workedMinutesOn(day.date, day.entries, day.usedLabels)
  const labelOf = (entry: Entry) =>
    day.usedLabels.find((label) => label.id === entry.labelId)

  return (
    <>
      <div className="day-head">
        <p className="day-total num">{`Worked ${formatMinutes(worked)}`}</p>
      </div>
      {overlaps(day.entries) && (
        <p className="msg warn" role="status">
          Some entries overlap
        </p>
      )}
      {day.entries.length === 0 ? (
        <p className="empty-day">No entries</p>
      ) : (
        <ul className="entries" aria-label="Entries">
          {day.entries.map((entry) => (
            <li
              key={entry.id}
              className={editing === entry.id ? 'edit-row' : undefined}
            >
              {editing === entry.id ? (
                <EntryEditor
                  entry={entry}
                  labels={day.labels}
                  label={labelOf(entry)}
                  warn={overlapWarning(day, entry.timeZone, entry.id)}
                  update={(changes) => entries.update(entry.id, changes)}
                  remove={() => entries.remove(entry.id)}
                  onDone={onEdited}
                  onCancel={() => onEdit(undefined)}
                />
              ) : (
                <EntryRow
                  entry={entry}
                  label={labelOf(entry)}
                  overlaps={overlapsAnother(entry, day.entries)}
                  onOpen={() => onEdit(entry.id)}
                />
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
