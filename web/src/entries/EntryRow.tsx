import { useEffect, useRef } from 'react'
import { durationOf } from '../domain/entries.ts'
import type { Entry, Label } from '../domain/records.ts'
import { formatMinutes } from '../domain/workedHours.ts'
import { timeRangeText } from './entryMessages.ts'

interface EntryRowProps {
  entry: Entry
  /** The entry's own label, which may be deleted; undefined when it is not stored. */
  label: Label | undefined
  /** Whether the entry overlaps another entry of its day. */
  overlaps: boolean
  /** Whether the row gets focus when it appears, e.g. after its editor closed. */
  focused: boolean
  /** Called when the row is clicked, to open its editor. */
  onOpen: () => void
}

/** The name a label chip shows. */
function chipText(label: Label | undefined): string {
  if (!label) return '(unknown label)'
  return label.deleted ? `${label.name} (deleted)` : label.name
}

/** One listed entry, read-only: its times, duration, description and label. Clicking it opens its editor. */
export function EntryRow({
  entry,
  label,
  overlaps,
  focused,
  onOpen,
}: EntryRowProps) {
  const billable = label?.billable === true
  const ref = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (focused) ref.current?.focus()
  }, [focused])

  return (
    <button
      type="button"
      ref={ref}
      className={billable ? 'entry' : 'entry nonbill'}
      onClick={onOpen}
    >
      <span className="time num">{timeRangeText(entry)}</span>
      <span className="dur num">{formatMinutes(durationOf(entry))}</span>
      <span className="desc">
        {entry.description || '—'}
        {overlaps && (
          <>
            {' '}
            <span className="overlap-flag">· overlaps</span>
          </>
        )}
      </span>
      <span className="lbl">
        <span className={billable ? 'chip' : 'chip nb'}>{chipText(label)}</span>
      </span>
    </button>
  )
}
