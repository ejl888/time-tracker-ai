import type { EntryService } from '../domain/entries.ts'
import { overlappingIds } from '../domain/entries.ts'
import type { Entry } from '../domain/records.ts'
import type { Day } from './day.ts'
import { EntryEditor } from './EntryEditor.tsx'
import { EntryRow } from './EntryRow.tsx'
import { overlapWarning } from './overlapWarning.ts'

export interface DayEntriesProps {
  day: Day
  entries: EntryService
  /** The id of the entry whose editor is open, if any. */
  editing: string | undefined
  /** The id of the entry whose editor closed last, whose row gets focus. */
  closed: string | undefined
  /** Opens the editor of an entry. */
  onEdit: (id: string) => void
  /** Closes the editor, discarding its changes. */
  onCancelEdit: () => void
  /** Called after an entry was saved or deleted. */
  onEdited: (id: string) => void
}

/** The overlap warning and list of a loaded day, with the open entry as an editor. */
export function DayEntries({
  day,
  entries,
  editing,
  closed,
  onEdit,
  onCancelEdit,
  onEdited,
}: DayEntriesProps) {
  const overlapIds = overlappingIds(day.entries)
  const labelOf = (entry: Entry) =>
    day.usedLabels.find((label) => label.id === entry.labelId)

  return (
    <>
      {overlapIds.size > 0 && (
        <p className="msg warn" role="status">
          Some entries overlap
        </p>
      )}
      {day.entries.length === 0 ? (
        <p className="empty-day">No entries</p>
      ) : (
        <ul className="entries" aria-label="Entries">
          {day.entries.map((entry) => (
            <li
              key={entry.id}
              className={editing === entry.id ? 'edit-row' : undefined}
            >
              {editing === entry.id ? (
                <EntryEditor
                  entry={entry}
                  labels={day.labels}
                  label={labelOf(entry)}
                  warn={overlapWarning(day, entry.timeZone, entry.id)}
                  update={(changes) => entries.update(entry.id, changes)}
                  remove={() => entries.remove(entry.id)}
                  onDone={() => onEdited(entry.id)}
                  onCancel={onCancelEdit}
                />
              ) : (
                <EntryRow
                  entry={entry}
                  label={labelOf(entry)}
                  overlaps={overlapIds.has(entry.id)}
                  focused={closed === entry.id}
                  onOpen={() => onEdit(entry.id)}
                />
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
