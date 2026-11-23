import { useEffect, useId, useRef, useState } from 'react'
import type { FormEvent, KeyboardEvent } from 'react'
import type { EntryChanges, EntryError } from '../domain/entries.ts'
import { endTimeOf, startTimeOf } from '../domain/entries.ts'
import type { Entry, Label } from '../domain/records.ts'
import type { Result } from '../domain/result.ts'
import {
  formatEndTime,
  formatTime,
  parseEndTime,
  parseTime,
} from '../domain/timeText.ts'
import { INVALID_TIME_MESSAGE, entryErrorMessage } from './entryMessages.ts'

type EntryResult = Result<Entry, EntryError>

interface EntryEditorProps {
  entry: Entry
  /** Labels that are not deleted, to pick from. */
  labels: Label[]
  /** The entry's own label, which may be deleted; undefined when it is not stored. */
  label: Label | undefined
  update: (changes: EntryChanges) => Promise<EntryResult>
  remove: () => Promise<EntryResult>
  /** Called after the entry was saved or deleted. */
  onDone: () => void
  /** Called when the editor closes without saving. */
  onCancel: () => void
}

/** The texts of the editor's fields. */
interface Draft {
  startText: string
  endText: string
  labelId: string
  description: string
}

function draftOf(entry: Entry): Draft {
  return {
    startText: formatTime(startTimeOf(entry)),
    endText: formatEndTime(endTimeOf(entry)),
    labelId: entry.labelId,
    description: entry.description,
  }
}

/**
 * The inline editor of a listed entry. Save or Enter saves; Cancel or Esc closes without saving.
 * Delete takes two clicks. A rejected save keeps the editor open with the typed values and shows why.
 */
export function EntryEditor({
  entry,
  labels,
  label,
  update,
  remove,
  onDone,
  onCancel,
}: EntryEditorProps) {
  const [draft, setDraft] = useState(() => draftOf(entry))
  const [message, setMessage] = useState<string>()
  const [deleteArmed, setDeleteArmed] = useState(false)
  const descriptionRef = useRef<HTMLInputElement>(null)
  const id = useId()
  const { startText, endText, labelId, description } = draft

  useEffect(() => {
    descriptionRef.current?.focus()
  }, [])

  function change(changes: Partial<Draft>) {
    setDraft({ ...draft, ...changes })
  }

  /** Runs an action, then reports it as done or shows why it was rejected. */
  async function run(action: Promise<EntryResult>) {
    const result = await action
    if (result.ok) onDone()
    else setMessage(entryErrorMessage(result.error))
  }

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const start = parseTime(startText)
    const end = parseEndTime(endText)
    if (!start || !end) {
      setMessage(INVALID_TIME_MESSAGE)
      return
    }
    void run(update({ start, end, labelId, description }))
  }

  /** The first click arms Delete; the second click deletes. */
  function clickDelete() {
    if (deleteArmed) void run(remove())
    else setDeleteArmed(true)
  }

  function onKeyDown(event: KeyboardEvent<HTMLFormElement>) {
    if (event.key !== 'Escape') return
    event.preventDefault()
    onCancel()
  }

  return (
    <form
      className="edit-form"
      aria-label="Edit entry"
      noValidate
      autoComplete="off"
      onSubmit={save}
      onKeyDown={onKeyDown}
    >
      <div className="edit-grid">
        <div className="field">
          <label htmlFor={`${id}-start`}>Start</label>
          <input
            id={`${id}-start`}
            className="num"
            value={startText}
            onChange={(e) => change({ startText: e.target.value })}
          />
        </div>
        <div className="field">
          <label htmlFor={`${id}-end`}>End</label>
          <input
            id={`${id}-end`}
            className="num"
            value={endText}
            onChange={(e) => change({ endText: e.target.value })}
          />
        </div>
        <div className="field wide">
          <label htmlFor={`${id}-description`}>Description</label>
          <input
            id={`${id}-description`}
            ref={descriptionRef}
            value={description}
            onChange={(e) => change({ description: e.target.value })}
          />
        </div>
        <div className="field wide">
          <label htmlFor={`${id}-label`}>Label</label>
          <select
            id={`${id}-label`}
            value={labelId}
            onChange={(e) => change({ labelId: e.target.value })}
          >
            {!label && <option value={entry.labelId}>(unknown label)</option>}
            {label?.deleted && (
              <option value={label.id}>{`${label.name} (deleted)`}</option>
            )}
            {labels.map((option) => (
              <option key={option.id} value={option.id}>
                {option.name}
              </option>
            ))}
          </select>
        </div>
      </div>
      {message && (
        <p className="msg err" role="alert">
          {message}
        </p>
      )}
      <div className="actions">
        <button className="btn primary" type="submit">
          Save
        </button>
        <button className="btn" type="button" onClick={onCancel}>
          Cancel
        </button>
        <button className="btn danger" type="button" onClick={clickDelete}>
          {deleteArmed ? 'Click again to delete' : 'Delete'}
        </button>
        <span className="spacer" />
        <span className="keys">Enter saves · Esc cancels</span>
      </div>
    </form>
  )
}
