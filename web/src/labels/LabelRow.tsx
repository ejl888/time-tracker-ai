import { useId, useState } from 'react'
import type { KeyboardEvent } from 'react'
import type { LabelError } from '../domain/labels.ts'
import type { Label } from '../domain/records.ts'
import type { Result } from '../domain/result.ts'

type LabelResult = Result<Label, LabelError>

interface LabelRowProps {
  label: Label
  used: boolean
  /** The text shown for a rejected action on the label with this name. */
  describe: (error: LabelError, name: string) => string
  rename: (name: string) => Promise<LabelResult>
  setBillable: (billable: boolean) => Promise<LabelResult>
  remove: () => Promise<LabelResult>
}

/**
 * One listed label: its name saves on Enter or blur and reverts on Esc.
 * A rejected action shows its message in the row until the next success.
 */
export function LabelRow({
  label,
  used,
  describe,
  rename,
  setBillable,
  remove,
}: LabelRowProps) {
  const [draft, setDraft] = useState(label.name)
  const [message, setMessage] = useState<string>()
  const messageId = useId()

  /** Runs an action and shows or clears the row's message. */
  async function run(
    action: Promise<LabelResult>,
    name: string,
  ): Promise<LabelResult> {
    const result = await action
    setMessage(result.ok ? undefined : describe(result.error, name))
    return result
  }

  async function save() {
    if (draft === label.name) return
    const result = await run(rename(draft), draft)
    setDraft(result.ok ? result.value.name : label.name)
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') event.currentTarget.blur()
    if (event.key === 'Escape') setDraft(label.name)
  }

  function confirmRemove() {
    if (window.confirm(`Delete label ${label.name}?`)) {
      void run(remove(), label.name)
    }
  }

  return (
    <li>
      <input
        aria-label="Label name"
        aria-describedby={message ? messageId : undefined}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={() => void save()}
      />
      <label>
        <input
          type="checkbox"
          checked={label.billable}
          disabled={used}
          onChange={(e) => void run(setBillable(e.target.checked), label.name)}
        />
        Billable
      </label>
      {used && <span>In use: create a new label to change this</span>}
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
