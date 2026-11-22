import { useId, useState } from 'react'
import type { KeyboardEvent } from 'react'
import type { Temporal } from 'temporal-polyfill'
import type { EntryChanges, EntryError } from '../domain/entries.ts'
import { durationOf, endTimeOf, startTimeOf } from '../domain/entries.ts'
import type { Entry, Label } from '../domain/records.ts'
import type { Result } from '../domain/result.ts'
import {
  formatEndTime,
  formatTime,
  parseEndTime,
  parseTime,
} from '../domain/timeText.ts'
import { formatMinutes } from '../domain/workedHours.ts'
import { INVALID_TIME_MESSAGE, entryErrorMessage } from './entryMessages.ts'

type EntryResult = Result<Entry, EntryError>

const showStart = (entry: Entry) => formatTime(startTimeOf(entry))
const showEnd = (entry: Entry) => formatEndTime(endTimeOf(entry))

interface EntryRowProps {
  entry: Entry
  /** Labels that are not deleted, to pick from. */
  labels: Label[]
  /** The entry's own label, which may be deleted. */
  label: Label | undefined
  update: (changes: EntryChanges) => Promise<EntryResult>
  remove: () => Promise<EntryResult>
  /** Called after the entry was changed or deleted. */
  onChanged: () => void
}

/**
 * One listed entry: its times, label, description and duration.
 * Text fields save on Enter or blur and revert on Esc; the label saves when picked.
 * A rejected change shows its message in the row until the next success.
 */
export function EntryRow({
  entry,
  labels,
  label,
  update,
  remove,
  onChanged,
}: EntryRowProps) {
  const [message, setMessage] = useState<string>()
  const messageId = useId()
  const describedBy = message ? messageId : undefined
  const showsDeletedLabel = label?.deleted === true

  /** Runs an action, then shows its message or reports the change. */
  async function run(action: Promise<EntryResult>): Promise<EntryResult> {
    const result = await action
    setMessage(result.ok ? undefined : entryErrorMessage(result.error))
    if (result.ok) onChanged()
    return result
  }

  /** Saves changes and resolves to the saved entry shown as text, or undefined when rejected. */
  async function save(
    changes: EntryChanges,
    show: (saved: Entry) => string,
  ): Promise<string | undefined> {
    const result = await run(update(changes))
    return result.ok ? show(result.value) : undefined
  }

  /** Saves a time field's text, or shows that it is not a valid time. */
  async function saveTime(
    text: string,
    parse: (text: string) => Temporal.PlainTime | undefined,
    changes: (time: Temporal.PlainTime) => EntryChanges,
    show: (saved: Entry) => string,
  ): Promise<string | undefined> {
    const time = parse(text)
    if (time) return save(changes(time), show)
    setMessage(INVALID_TIME_MESSAGE)
    return undefined
  }

  function confirmRemove() {
    if (window.confirm('Delete this entry?')) void run(remove())
  }

  return (
    <li>
      <DraftInput
        name="Start"
        saved={showStart(entry)}
        describedBy={describedBy}
        save={(text) =>
          saveTime(text, parseTime, (start) => ({ start }), showStart)
        }
      />
      <DraftInput
        name="End"
        saved={showEnd(entry)}
        describedBy={describedBy}
        save={(text) =>
          saveTime(text, parseEndTime, (end) => ({ end }), showEnd)
        }
      />
      <select
        aria-label="Label"
        aria-describedby={describedBy}
        value={entry.labelId}
        onChange={(e) => void run(update({ labelId: e.target.value }))}
      >
        {!label && <option value={entry.labelId}>(unknown label)</option>}
        {showsDeletedLabel && (
          <option value={label.id}>{`${label.name} (deleted)`}</option>
        )}
        {labels.map((option) => (
          <option key={option.id} value={option.id}>
            {option.name}
          </option>
        ))}
      </select>
      <DraftInput
        name="Description"
        saved={entry.description}
        describedBy={describedBy}
        save={(description) =>
          save({ description }, (saved) => saved.description)
        }
      />
      <span>{formatMinutes(durationOf(entry))}</span>
      <button type="button" onClick={confirmRemove}>
        Delete
      </button>
      {message && (
        <p id={messageId} role="alert">
          {message}
        </p>
      )}
    </li>
  )
}

interface DraftInputProps {
  name: string
  /** The saved value; the draft starts from it and returns to it on Esc or a rejected save. */
  saved: string
  describedBy: string | undefined
  /** Saves the changed text; resolves to the saved value, or undefined when rejected. */
  save: (text: string) => Promise<string | undefined>
}

/**
 * A text field that saves on Enter or blur when its text changed and reverts on Esc.
 * The row is rendered again with the saved values after a successful save.
 */
function DraftInput({ name, saved, describedBy, save }: DraftInputProps) {
  const [draft, setDraft] = useState(saved)

  async function onBlur() {
    if (draft === saved) return
    setDraft((await save(draft)) ?? saved)
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') event.currentTarget.blur()
    if (event.key === 'Escape') setDraft(saved)
  }

  return (
    <input
      aria-label={name}
      aria-describedby={describedBy}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={onKeyDown}
      onBlur={() => void onBlur()}
    />
  )
}
