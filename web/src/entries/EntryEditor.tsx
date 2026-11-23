import { useEffect, useRef, useState } from 'react'
import type { EntryChanges } from '../domain/entries.ts'
import { dateOf, endTimeOf, startTimeOf } from '../domain/entries.ts'
import type { Entry, Label } from '../domain/records.ts'
import { formatEndTime, formatTime } from '../domain/timeText.ts'
import type {
  Draft,
  EntryResult,
  LabelChoice,
  TimesWarning,
} from './EntryForm.tsx'
import { EntryForm } from './EntryForm.tsx'

interface EntryEditorProps {
  entry: Entry
  /** Labels that are not deleted, to pick from. */
  labels: Label[]
  /** The entry's own label, which may be deleted; undefined when it is not stored. */
  label: Label | undefined
  /** Warns about the typed times, e.g. which other entries they overlap. */
  warn: TimesWarning
  update: (changes: EntryChanges) => Promise<EntryResult>
  remove: () => Promise<EntryResult>
  /** Called after the entry was saved or deleted. */
  onDone: () => void
  /** Called when the editor closes without saving. */
  onCancel: () => void
}

function draftOf(entry: Entry): Draft {
  return {
    startText: formatTime(startTimeOf(entry)),
    endText: formatEndTime(endTimeOf(entry)),
    labelId: entry.labelId,
    description: entry.description,
  }
}

/** The labels to pick from, preceded by the entry's own label when it is unknown or deleted. */
function labelChoicesOf(
  entry: Entry,
  labels: Label[],
  label: Label | undefined,
): LabelChoice[] {
  const choices = labels.map((option) => ({
    value: option.id,
    name: option.name,
    billable: option.billable,
  }))
  if (!label)
    return [{ value: entry.labelId, name: '(unknown label)' }, ...choices]
  if (label.deleted) {
    const name = `${label.name} (deleted)`
    return [{ value: label.id, name, billable: label.billable }, ...choices]
  }
  return choices
}

/**
 * The inline editor of a listed entry, with focus on Description. Save or Enter saves; Cancel or Esc closes without
 * saving. Delete takes two clicks. A rejected save keeps the editor open with the typed values and shows why.
 */
export function EntryEditor({
  entry,
  labels,
  label,
  warn,
  update,
  remove,
  onDone,
  onCancel,
}: EntryEditorProps) {
  const [draft, setDraft] = useState(() => draftOf(entry))
  const descriptionRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    descriptionRef.current?.focus()
  }, [])

  return (
    <EntryForm
      name="Edit entry"
      submitText="Save"
      draft={draft}
      date={dateOf(entry)}
      timeZone={entry.timeZone}
      onChange={(changes) => setDraft({ ...draft, ...changes })}
      labelChoices={labelChoicesOf(entry, labels, label)}
      endTouched
      warn={warn}
      save={update}
      remove={remove}
      onDone={onDone}
      onCancel={onCancel}
      descriptionRef={descriptionRef}
    />
  )
}
