import { useEffect, useEffectEvent, useRef, useState } from 'react'
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
  /** Whether End, or Start without a prefill, gets focus when the prefill of an opened day or after an add is shown. */
  focused: boolean
  /** Called after an entry was added, to show the prefill of the next entry. */
  onAdded: () => void
}

/** The texts in the add row; End is undefined while untouched, so it follows Start. */
type RowDraft = Omit<Draft, 'endText'> & { endText: string | undefined }

/**
 * The end time a row is prefilled with. A prefilled end equals the start, so 00:00 can only mean a start of 00:00;
 * an end of 00:00 would be read as midnight (a full day), so the end is left empty for you to type.
 */
function prefilledEnd(end: Temporal.PlainTime): string {
  return end.equals(MIDNIGHT) ? '' : formatTime(end)
}

/** The fields of a row nobody has typed in yet: the prefill, no label and no description. */
function untouchedDraft(prefill: Prefill | undefined): RowDraft {
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

/** Whether focus is on something outside the row, e.g. another field; not when nothing has focus. */
function focusIsOutside(row: HTMLElement | null): boolean {
  const active = document.activeElement
  return active !== document.body && !row?.contains(active)
}

/**
 * A form to add an entry to the shown date. Until you type in it, it shows the prefill, and End follows Start until
 * you change End. Add or Enter adds; after a successful add it shows the next prefill.
 * Once `focused`, it puts focus on End, or on Start when there is no prefill, unless you already typed in it or
 * moved focus elsewhere.
 * Cancel or Esc resets it to the prefill.
 */
export function AddEntryRow({
  entries,
  date,
  labels,
  timeZone,
  prefill,
  focused,
  warn,
  onAdded,
}: AddEntryRowProps) {
  // Only the fields you changed, so the others show the prefill, also when it loads later; undefined while untouched.
  const [typed, setTyped] = useState<Partial<Draft>>()
  const rowRef = useRef<HTMLDivElement>(null)
  const startRef = useRef<HTMLInputElement>(null)
  const endRef = useRef<HTMLInputElement>(null)
  const current: RowDraft = { ...untouchedDraft(prefill), ...typed }
  const draft: Draft = {
    ...current,
    endText: current.endText ?? followingEnd(prefill, current.startText),
  }
  const labelChoices = [
    { value: '', name: 'Pick a label' },
    ...choicesOf(labels),
  ]

  const takeFocus = useEffectEvent(() => {
    if (typed || focusIsOutside(rowRef.current)) return
    ;(prefill ? endRef : startRef).current?.focus()
  })
  useEffect(() => {
    if (focused) takeFocus()
  }, [focused])

  function added() {
    setTyped(undefined)
    onAdded()
  }

  return (
    <div className="edit-row" ref={rowRef}>
      <EntryForm
        name="Add entry"
        submitText="Add"
        draft={draft}
        date={date}
        timeZone={timeZone}
        onChange={(changes) => setTyped({ ...typed, ...changes })}
        labelChoices={labelChoices}
        endTouched={current.endText !== undefined}
        startHelp={startHelpOf(prefill, current.startText)}
        warn={warn}
        save={(fields: DraftFields) =>
          entries.add({ ...fields, date, timeZone })
        }
        onDone={added}
        onCancel={() => setTyped(undefined)}
        startRef={startRef}
        endRef={endRef}
      />
    </div>
  )
}
