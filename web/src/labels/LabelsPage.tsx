import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import type { LabelError, LabelService, ListedLabel } from '../domain/labels.ts'
import { normalizeName } from '../domain/labels.ts'
import type { Label } from '../domain/records.ts'
import type { Result } from '../domain/result.ts'
import { LabelRow } from './LabelRow.tsx'
import './labels.css'

/** The text shown to the user for a rejected label action. */
function errorMessage(error: LabelError, name: string): string {
  switch (error) {
    case 'empty-name':
      return 'Enter a name'
    case 'duplicate-name':
      return `A label named ${normalizeName(name)} already exists`
    case 'label-in-use':
      return 'This label is used by entries, so its billable setting cannot change'
    case 'not-found':
      return 'This label no longer exists'
  }
}

export function LabelsPage({ labels }: { labels: LabelService }) {
  const [list, setList] = useState<ListedLabel[]>([])
  const [name, setName] = useState('')
  const [billable, setBillable] = useState(true)
  const [message, setMessage] = useState<string>()

  useEffect(() => {
    let current = true
    void labels.listWithUsage().then((loaded) => {
      if (current) setList(loaded)
    })
    return () => {
      current = false
    }
  }, [labels])

  /** Waits for an action and reloads the list when it succeeds. */
  async function apply(
    action: Promise<Result<Label, LabelError>>,
  ): Promise<Result<Label, LabelError>> {
    const result = await action
    if (result.ok) setList(await labels.listWithUsage())
    return result
  }

  async function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const result = await apply(labels.create(name, { billable }))
    if (!result.ok) {
      setMessage(errorMessage(result.error, name))
      return
    }
    setMessage(undefined)
    setName('')
    setBillable(true)
  }

  return (
    <section className="panel">
      <h2>Labels</h2>
      {list.length > 0 && (
        <ul className="label-list">
          {list.map(({ label, used }) => (
            <LabelRow
              key={label.id}
              label={label}
              used={used}
              describe={errorMessage}
              rename={(newName) => apply(labels.rename(label.id, newName))}
              setBillable={(newBillable) =>
                apply(labels.setBillable(label.id, newBillable))
              }
              remove={() => apply(labels.remove(label.id))}
            />
          ))}
        </ul>
      )}
      <form className="add-label" aria-label="Add label" onSubmit={add}>
        <label className="name-field">
          Name
          <input
            className="text-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label className="switch">
          <input
            type="checkbox"
            checked={billable}
            onChange={(e) => setBillable(e.target.checked)}
          />
          Billable
        </label>
        <button className="btn primary" type="submit">
          Add
        </button>
      </form>
      {message && (
        <p className="msg err" role="alert">
          {message}
        </p>
      )}
    </section>
  )
}
