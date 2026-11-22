import { durationOf, endTimeOf, startTimeOf } from '../domain/entries.ts'
import type { Entry, Label } from '../domain/records.ts'
import { formatEndTime, formatTime } from '../domain/timeText.ts'
import { formatMinutes } from '../domain/workedHours.ts'

interface EntryRowProps {
  entry: Entry
  /** Labels that are not deleted, to pick from. */
  labels: Label[]
  /** The entry's own label, which may be deleted. */
  label: Label | undefined
}

/** One listed entry: its times, label, description and duration. */
export function EntryRow({ entry, labels, label }: EntryRowProps) {
  const showsDeletedLabel = label?.deleted === true

  return (
    <li>
      <input
        aria-label="Start"
        value={formatTime(startTimeOf(entry))}
        readOnly
      />
      <input
        aria-label="End"
        value={formatEndTime(endTimeOf(entry))}
        readOnly
      />
      {/* Read-only for now: the controlled value stays until editing saves it. */}
      <select aria-label="Label" value={entry.labelId} onChange={() => {}}>
        {showsDeletedLabel && (
          <option value={label.id}>{`${label.name} (deleted)`}</option>
        )}
        {labels.map((option) => (
          <option key={option.id} value={option.id}>
            {option.name}
          </option>
        ))}
      </select>
      <input aria-label="Description" value={entry.description} readOnly />
      <span>{formatMinutes(durationOf(entry))}</span>
      <button type="button">Delete</button>
    </li>
  )
}
