import { useState } from 'react'
import type { FormEvent } from 'react'
import type { Temporal } from 'temporal-polyfill'
import type { EntryService } from '../domain/entries.ts'
import type { Label } from '../domain/records.ts'
import { parseEndTime, parseTime } from '../domain/timeText.ts'
import { entryErrorMessage, INVALID_TIME_MESSAGE } from './entryMessages.ts'

interface AddEntryRowProps {
  entries: EntryService
  /** The date the entry is added to. */
  date: Temporal.PlainDate
  /** Labels that are not deleted, to pick from. */
  labels: Label[]
  timeZone: string
  /** Called after an entry was added. */
  onAdded: () => void
}

/** A form to add an entry to the shown date; it clears itself after a successful add. */
export function AddEntryRow({
  entries,
  date,
  labels,
  timeZone,
  onAdded,
}: AddEntryRowProps) {
  const [startText, setStartText] = useState('')
  const [endText, setEndText] = useState('')
  const [labelId, setLabelId] = useState('')
  const [description, setDescription] = useState('')
  const [message, setMessage] = useState<string>()

  function clear() {
    setStartText('')
    setEndText('')
    setLabelId('')
    setDescription('')
    setMessage(undefined)
  }

  async function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const start = parseTime(startText)
    const end = parseEndTime(endText)
    if (!start || !end) {
      setMessage(INVALID_TIME_MESSAGE)
      return
    }
    const result = await entries.add({
      date,
      start,
      end,
      labelId,
      description,
      timeZone,
    })
    if (!result.ok) {
      setMessage(entryErrorMessage(result.error))
      return
    }
    clear()
    onAdded()
  }

  return (
    <form
      className="add-entry edit-row edit-grid"
      aria-label="Add entry"
      onSubmit={add}
    >
      <input
        className="num"
        aria-label="Start"
        value={startText}
        onChange={(e) => setStartText(e.target.value)}
      />
      <input
        className="num"
        aria-label="End"
        value={endText}
        onChange={(e) => setEndText(e.target.value)}
      />
      <select
        aria-label="Label"
        value={labelId}
        onChange={(e) => setLabelId(e.target.value)}
      >
        <option value="">Pick a label</option>
        {labels.map((label) => (
          <option key={label.id} value={label.id}>
            {label.name}
          </option>
        ))}
      </select>
      <input
        className="wide"
        aria-label="Description"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
      />
      <button className="btn primary small" type="submit">
        Add
      </button>
      {message && (
        <p className="msg err" role="alert">
          {message}
        </p>
      )}
    </form>
  )
}
