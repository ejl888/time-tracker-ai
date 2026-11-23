import { useRef, useState } from 'react'
import type { Temporal } from 'temporal-polyfill'
import type { EntryService, Prefill, PrefillSource } from '../domain/entries.ts'
import type { Label } from '../domain/records.ts'
import { formatTime, MIDNIGHT } from '../domain/timeText.ts'
import type { Draft, DraftFields, TimesWarning } from './EntryForm.tsx'
import { EntryForm } from './EntryForm.tsx'
import { formatShortDate } from './dateText.ts'
import { choicesOf } from './labelChoices.ts'

interface AddEntryRowProps {
  entries: EntryService
  /** The date the entry is added to. */
  date: Temporal.PlainDate
  /** Labels that are not deleted, to pick from. */
  labels: Label[]
  timeZone: string
  /** The times an untouched row shows; empty fields when undefined. */
  prefill: Prefill | undefined
  /** Warns about the typed times, e.g. which entries they overlap. */
  warn: TimesWarning
  /** Called after an entry was added; resolves to the prefill of the next entry. */
  onAdded: () => Promise<Prefill | undefined>
}

/** The texts typed in the add row; End is undefined while untouched, so it follows Start. */
type TypedDraft = Omit<Draft, 'endText'> & { endText: string | undefined }

/**
 * The end time a row is prefilled with. A prefilled end equals the start, so 00:00 can only mean a start of 00:00;
 * an end of 00:00 would be read as midnight (a full day), so the end is left empty for you to type.
 */
function prefilledEnd(end: Temporal.PlainTime): string {
  return end.equals(MIDNIGHT) ? '' : formatTime(end)
}

/** The fields of a row nobody has typed in yet: the prefill, no label and no description. */
function untouchedDraft(prefill: Prefill | undefined): TypedDraft {
  return {
    startText: prefill ? formatTime(prefill.start) : '',
    endText: undefined,
    labelId: '',
    description: '',
  }
}

/** Where a prefilled start comes from, e.g. "From previous entry" or "Same as Wed 11 Nov". */
function sourceText(source: PrefillSource): string {
  switch (source.kind) {
    case 'previous':
      return 'From previous entry'
    case 'same-as':
      return `Same as ${formatShortDate(source.date)}`
    case 'default':
      return 'Default start'
  }
}

/** Where the start comes from, while Start shows the prefilled start. */
function startHelpOf(
  prefill: Prefill | undefined,
  startText: string,
): string | undefined {
  if (!prefill || startText !== formatTime(prefill.start)) return undefined
  return sourceText(prefill.source)
}

/**
 * The end an untouched End shows: the start as typed, like the prefill, whose end equals its start.
 * A prefilled end that is left empty stays empty.
 */
function followingEnd(prefill: Prefill | undefined, startText: string): string {
  return prefill && prefilledEnd(prefill.end) !== '' ? startText : ''
}

/**
 * A form to add an entry to the shown date. Until you type in it, it shows the prefill, and End follows Start until
 * you change End. Add or Enter adds; after a successful add it shows the next prefill
 * with focus on End, or on Start when there is no prefill.
 * Cancel or Esc resets it to the prefill.
 */
export function AddEntryRow({
  entries,
  date,
  labels,
  timeZone,
  prefill,
  warn,
  onAdded,
}: AddEntryRowProps) {
  // Undefined while untouched, so a new prefill shows; set on the first change.
  const [typed, setTyped] = useState<TypedDraft>()
  const startRef = useRef<HTMLInputElement>(null)
  const endRef = useRef<HTMLInputElement>(null)
  const current = typed ?? untouchedDraft(prefill)
  const draft: Draft = {
    ...current,
    endText: current.endText ?? followingEnd(prefill, current.startText),
  }
  const labelChoices = [
    { value: '', name: 'Pick a label' },
    ...choicesOf(labels),
  ]

  async function added() {
    setTyped(undefined)
    const next = await onAdded()
    ;(next ? endRef : startRef).current?.focus()
  }

  return (
    <div className="edit-row">
      <EntryForm
        name="Add entry"
        submitText="Add"
        draft={draft}
        date={date}
        timeZone={timeZone}
        onChange={(changes) => setTyped({ ...current, ...changes })}
        labelChoices={labelChoices}
        endTouched={current.endText !== undefined}
        startHelp={startHelpOf(prefill, current.startText)}
        warn={warn}
        save={(fields: DraftFields) =>
          entries.add({ ...fields, date, timeZone })
        }
        onDone={() => void added()}
        onCancel={() => setTyped(undefined)}
        startRef={startRef}
        endRef={endRef}
      />
    </div>
  )
}
