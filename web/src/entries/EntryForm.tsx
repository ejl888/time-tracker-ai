import { useId, useState } from 'react'
import type { FormEvent, Ref } from 'react'
import type { Temporal } from 'temporal-polyfill'
import type { EntryError, NewEntry, TimeRange } from '../domain/entries.ts'
import { durationOfRange, endsAfterStart } from '../domain/entries.ts'
import type { Entry } from '../domain/records.ts'
import type { Result } from '../domain/result.ts'
import { parseEndTime, parseTime } from '../domain/timeText.ts'
import { formatMinutes } from '../domain/workedHours.ts'
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
  /** Whether the label is billable; undefined for a choice that is no stored label. */
  billable?: boolean
}

/** The warning for a draft's times, or undefined when there is nothing to warn about. */
export type TimesWarning = (
  start: Temporal.PlainTime,
  end: Temporal.PlainTime,
) => string | undefined

/** The help texts and live messages for a draft, as it is typed. */
interface DraftCheck {
  /** "Duration H:MM", when End is after Start. */
  duration?: string
  /** Why End is wrong, once End was changed. */
  endError?: string
  warning?: string | undefined
}

/** The draft with its times parsed, or undefined when Start or End is not a valid time. */
function parseDraft(draft: Draft): DraftFields | undefined {
  const start = parseTime(draft.startText)
  const end = parseEndTime(draft.endText)
  if (!start || !end) return undefined
  return { start, end, labelId: draft.labelId, description: draft.description }
}

/** Where a draft's times are: the date and time zone of its entry. */
type DraftPlace = Pick<TimeRange, 'date' | 'timeZone'>

/**
 * Checks a draft's times as they are typed; nothing to say while Start or End is not a valid time.
 * The duration is the real time worked on the date in the time zone, as the entry would be stored.
 */
function checkDraft(
  draft: Draft,
  place: DraftPlace,
  endTouched: boolean,
  warn: TimesWarning | undefined,
): DraftCheck {
  const fields = parseDraft(draft)
  if (!fields) return {}
  const { start, end } = fields
  if (endsAfterStart(start, end)) {
    const minutes = durationOfRange({ ...place, start, end })
    return {
      // A start in the spring-forward gap moves on and can pass the end.
      ...(minutes > 0 && { duration: `Duration ${formatMinutes(minutes)}` }),
      warning: warn?.(start, end),
    }
  }
  return endTouched
    ? { endError: entryErrorMessage('end-not-after-start') }
    : {}
}

/** "Billable" or "Non-billable" for the picked label; undefined when it is no stored label. */
function billableHelp(choice: LabelChoice | undefined): string | undefined {
  if (choice?.billable === undefined) return undefined
  return choice.billable ? 'Billable' : 'Non-billable'
}

interface EntryFormProps {
  /** The form's accessible name. */
  name: string
  /** The text of the submit button. */
  submitText: string
  draft: Draft
  /** The date of the entry, to work out the duration. */
  date: Temporal.PlainDate
  /** The IANA time zone the entry is entered in, to work out the duration. */
  timeZone: string
  onChange: (changes: Partial<Draft>) => void
  labelChoices: LabelChoice[]
  /** Whether End counts as changed, so an end that is not after the start shows a message right away. */
  endTouched: boolean
  /** Help text of Start, e.g. where a prefilled start comes from. */
  startHelp?: string | undefined
  /** Warns about the typed times, e.g. which entries they overlap. */
  warn?: TimesWarning
  save: (fields: DraftFields) => Promise<EntryResult>
  /** Deletes the entry; without it the form has no Delete button. */
  remove?: () => Promise<EntryResult>
  /** Called after a successful save or delete. */
  onDone: () => void
  /** Called on Cancel or Esc. */
  onCancel: () => void
  startRef?: Ref<HTMLInputElement>
  endRef?: Ref<HTMLInputElement>
  descriptionRef?: Ref<HTMLInputElement>
}

/**
 * The fields and actions of an entry: Start, End, Description and Label, each with its label above, as in the
 * prototype's editor. Submit or Enter saves; Cancel or Esc cancels; Delete, when given, takes two clicks.
 * A rejected save or delete shows why. While you type, the fields show help (Start's `startHelp`, the duration
 * under End, billable or not under Label), and the messages show an end that is not after the start once End was
 * changed, and the warning from `warn`.
 */
export function EntryForm({
  name,
  submitText,
  draft,
  date,
  timeZone,
  onChange,
  labelChoices,
  endTouched,
  startHelp,
  warn,
  save,
  remove,
  onDone,
  onCancel,
  startRef,
  endRef,
  descriptionRef,
}: EntryFormProps) {
  const [message, setMessage] = useState<string>()
  const [deleteArmed, setDeleteArmed] = useState(false)
  const id = useId()
  const { startText, endText, labelId, description } = draft
  const check = checkDraft(draft, { date, timeZone }, endTouched, warn)
  const labelHelp = billableHelp(
    labelChoices.find((choice) => choice.value === labelId),
  )

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
            ref={startRef}
            aria-describedby={`${id}-start-help`}
            value={startText}
            onChange={(e) => onChange({ startText: e.target.value })}
          />
          <span className="help" id={`${id}-start-help`}>
            {startHelp}
          </span>
        </div>
        <div className="field">
          <label htmlFor={`${id}-end`}>End</label>
          <input
            id={`${id}-end`}
            className="num"
            ref={endRef}
            aria-describedby={`${id}-end-help`}
            value={endText}
            onChange={(e) => onChange({ endText: e.target.value })}
          />
          <span className="help" id={`${id}-end-help`}>
            {check.duration}
          </span>
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
            aria-describedby={`${id}-label-help`}
            value={labelId}
            onChange={(e) => onChange({ labelId: e.target.value })}
          >
            {labelChoices.map((choice) => (
              <option key={choice.value} value={choice.value}>
                {choice.name}
              </option>
            ))}
          </select>
          <span className="help" id={`${id}-label-help`}>
            {labelHelp}
          </span>
        </div>
      </div>
      <div className="msgs">
        {message && (
          <p className="msg err" role="alert">
            {message}
          </p>
        )}
        {check.endError && check.endError !== message && (
          <p className="msg err">{check.endError}</p>
        )}
        {check.warning && <p className="msg warn">{check.warning}</p>}
      </div>
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
