import { durationOf, endTimeOf, startTimeOf } from '../domain/entries.ts'
import type { Entry, Label } from '../domain/records.ts'
import { formatEndTime, formatTime } from '../domain/timeText.ts'
import { formatMinutes } from '../domain/workedHours.ts'

interface EntryRowProps {
  entry: Entry
  /** The entry's own label, which may be deleted; undefined when it is not stored. */
  label: Label | undefined
  /** Whether the entry overlaps another entry of its day. */
  overlaps: boolean
  /** Called when the row is clicked, to open its editor. */
  onOpen: () => void
}

/** The name a label chip shows. */
function chipText(label: Label | undefined): string {
  if (!label) return '(unknown label)'
  return label.deleted ? `${label.name} (deleted)` : label.name
}

/** One listed entry, read-only: its times, duration, description and label. Clicking it opens its editor. */
export function EntryRow({ entry, label, overlaps, onOpen }: EntryRowProps) {
  const billable = label?.billable === true
  const time = `${formatTime(startTimeOf(entry))}–${formatEndTime(endTimeOf(entry))}`

  return (
    <button
      type="button"
      className={billable ? 'entry' : 'entry nonbill'}
      onClick={onOpen}
    >
      <span className="time num">{time}</span>
      <span className="dur num">{formatMinutes(durationOf(entry))}</span>
      <span className="desc">
        {entry.description || '—'}
        {overlaps && <span className="overlap-flag"> · overlaps</span>}
      </span>
      <span className="lbl">
        <span className={billable ? 'chip' : 'chip nb'}>{chipText(label)}</span>
      </span>
    </button>
  )
}
