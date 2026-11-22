import { useState } from 'react'
import type { FormEvent } from 'react'
import type { Temporal } from 'temporal-polyfill'
import type { EntryService, Prefill } from '../domain/entries.ts'
import type { Label } from '../domain/records.ts'
import {
  formatTime,
  MIDNIGHT,
  parseEndTime,
  parseTime,
} from '../domain/timeText.ts'
import { entryErrorMessage, INVALID_TIME_MESSAGE } from './entryMessages.ts'

interface AddEntryRowProps {
  entries: EntryService
  /** The date the entry is added to. */
  date: Temporal.PlainDate
  /** Labels that are not deleted, to pick from. */
  labels: Label[]
  timeZone: string
  /** The times an untouched row shows; empty fields when undefined. */
  prefill: Prefill | undefined
  /** Called after an entry was added. */
  onAdded: () => void
}

/** The texts of the add row's fields. */
interface Draft {
  startText: string
  endText: string
  labelId: string
  description: string
}

/**
 * The end time a row is prefilled with. A prefilled end equals the start, so 00:00 can only mean a start of 00:00;
 * an end of 00:00 would be read as midnight (a full day), so the end is left empty for you to type.
 */
function prefilledEnd(end: Temporal.PlainTime): string {
  return end.equals(MIDNIGHT) ? '' : formatTime(end)
}

/** The fields of a row nobody has typed in yet: the prefill, no label and no description. */
function untouchedDraft(prefill: Prefill | undefined): Draft {
  return {
    startText: prefill ? formatTime(prefill.start) : '',
    endText: prefill ? prefilledEnd(prefill.end) : '',
    labelId: '',
    description: '',
  }
}

/**
 * A form to add an entry to the shown date. Until you type in it, it shows the prefill;
 * after a successful add it shows the next prefill again.
 */
export function AddEntryRow({
  entries,
  date,
  labels,
  timeZone,
  prefill,
  onAdded,
}: AddEntryRowProps) {
  // Undefined while untouched, so a new prefill shows; set on the first change.
  const [typed, setTyped] = useState<Draft>()
  const [message, setMessage] = useState<string>()
  const draft = typed ?? untouchedDraft(prefill)
  const { startText, endText, labelId, description } = draft

  function change(changes: Partial<Draft>) {
    setTyped({ ...draft, ...changes })
  }

  function clear() {
    setTyped(undefined)
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
        onChange={(e) => change({ startText: e.target.value })}
      />
      <input
        className="num"
        aria-label="End"
        value={endText}
        onChange={(e) => change({ endText: e.target.value })}
      />
      <select
        aria-label="Label"
        value={labelId}
        onChange={(e) => change({ labelId: e.target.value })}
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
        onChange={(e) => change({ description: e.target.value })}
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
