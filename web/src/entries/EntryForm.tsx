import { useId, useState } from 'react'
import type { FormEvent, Ref } from 'react'
import type { EntryError, NewEntry } from '../domain/entries.ts'
import type { Entry } from '../domain/records.ts'
import type { Result } from '../domain/result.ts'
import { parseEndTime, parseTime } from '../domain/timeText.ts'
import { cancelOnEscape } from './cancelOnEscape.ts'
import { entryErrorMessage, INVALID_TIME_MESSAGE } from './entryMessages.ts'

export type EntryResult = Result<Entry, EntryError>

/** The texts of an entry form's fields. */
export interface Draft {
  startText: string
  endText: string
  labelId: string
  description: string
}

/** A draft with its times parsed, ready to save. */
export type DraftFields = Pick<
  NewEntry,
  'start' | 'end' | 'labelId' | 'description'
>

/** An option of the Label dropdown. */
export interface LabelChoice {
  value: string
  name: string
}

/** The draft with its times parsed, or undefined when Start or End is not a valid time. */
function parseDraft(draft: Draft): DraftFields | undefined {
  const start = parseTime(draft.startText)
  const end = parseEndTime(draft.endText)
  if (!start || !end) return undefined
  return { start, end, labelId: draft.labelId, description: draft.description }
}

interface EntryFormProps {
  /** The form's accessible name. */
  name: string
  /** The text of the submit button. */
  submitText: string
  draft: Draft
  onChange: (changes: Partial<Draft>) => void
  labelChoices: LabelChoice[]
  save: (fields: DraftFields) => Promise<EntryResult>
  /** Deletes the entry; without it the form has no Delete button. */
  remove?: () => Promise<EntryResult>
  /** Called after a successful save or delete. */
  onDone: () => void
  /** Called on Cancel or Esc. */
  onCancel: () => void
  endRef?: Ref<HTMLInputElement>
  descriptionRef?: Ref<HTMLInputElement>
}

/**
 * The fields and actions of an entry: Start, End, Description and Label, each with its label above, as in the
 * prototype's editor. Submit or Enter saves; Cancel or Esc cancels; Delete, when given, takes two clicks.
 * A rejected save or delete shows why.
 */
export function EntryForm({
  name,
  submitText,
  draft,
  onChange,
  labelChoices,
  save,
  remove,
  onDone,
  onCancel,
  endRef,
  descriptionRef,
}: EntryFormProps) {
  const [message, setMessage] = useState<string>()
  const [deleteArmed, setDeleteArmed] = useState(false)
  const id = useId()
  const { startText, endText, labelId, description } = draft

  /** Runs an action, then reports it as done or shows why it was rejected. */
  async function run(action: Promise<EntryResult>) {
    const result = await action
    if (!result.ok) {
      setMessage(entryErrorMessage(result.error))
      return
    }
    setMessage(undefined)
    onDone()
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const fields = parseDraft(draft)
    if (fields) void run(save(fields))
    else setMessage(INVALID_TIME_MESSAGE)
  }

  function cancel() {
    setMessage(undefined)
    setDeleteArmed(false)
    onCancel()
  }

  /** The first click arms Delete; the second click deletes. */
  function clickDelete() {
    if (!remove) return
    if (deleteArmed) void run(remove())
    else setDeleteArmed(true)
  }

  return (
    <form
      className="edit-form"
      aria-label={name}
      noValidate
      autoComplete="off"
      onSubmit={submit}
      onKeyDown={cancelOnEscape(cancel)}
    >
      <div className="edit-grid">
        <div className="field">
          <label htmlFor={`${id}-start`}>Start</label>
          <input
            id={`${id}-start`}
            className="num"
            value={startText}
            onChange={(e) => onChange({ startText: e.target.value })}
          />
        </div>
        <div className="field">
          <label htmlFor={`${id}-end`}>End</label>
          <input
            id={`${id}-end`}
            className="num"
            ref={endRef}
            value={endText}
            onChange={(e) => onChange({ endText: e.target.value })}
          />
        </div>
        <div className="field wide">
          <label htmlFor={`${id}-description`}>Description</label>
          <input
            id={`${id}-description`}
            ref={descriptionRef}
            value={description}
            onChange={(e) => onChange({ description: e.target.value })}
          />
        </div>
        <div className="field wide">
          <label htmlFor={`${id}-label`}>Label</label>
          <select
            id={`${id}-label`}
            value={labelId}
            onChange={(e) => onChange({ labelId: e.target.value })}
          >
            {labelChoices.map((choice) => (
              <option key={choice.value} value={choice.value}>
                {choice.name}
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
        <button className="btn primary small" type="submit">
          {submitText}
        </button>
        <button className="btn small" type="button" onClick={cancel}>
          Cancel
        </button>
        {remove && (
          <button
            className="btn danger small"
            type="button"
            onClick={clickDelete}
          >
            {deleteArmed ? 'Click again to delete' : 'Delete'}
          </button>
        )}
        <span className="spacer" />
        <span className="keys">Enter saves · Esc cancels</span>
      </div>
    </form>
  )
}
