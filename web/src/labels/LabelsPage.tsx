import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import type { LabelError, LabelService } from '../domain/labels.ts'
import { normalizeName } from '../domain/labels.ts'
import type { Label } from '../domain/records.ts'

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
  const [list, setList] = useState<Label[]>([])
  const [name, setName] = useState('')
  const [billable, setBillable] = useState(true)
  const [message, setMessage] = useState<string>()

  useEffect(() => {
    let current = true
    void labels.list().then((loaded) => {
      if (current) setList(loaded)
    })
    return () => {
      current = false
    }
  }, [labels])

  async function reload() {
    setList(await labels.list())
  }

  async function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const result = await labels.create(name, { billable })
    if (!result.ok) {
      setMessage(errorMessage(result.error, name))
      return
    }
    setMessage(undefined)
    setName('')
    setBillable(true)
    await reload()
  }

  return (
    <section>
      <h2>Labels</h2>
      {list.length > 0 && (
        <ul>
          {list.map((label) => (
            <li key={label.id}>
              <input aria-label="Label name" value={label.name} readOnly />
              <label>
                <input type="checkbox" checked={label.billable} readOnly />
                Billable
              </label>
            </li>
          ))}
        </ul>
      )}
      <form aria-label="Add label" onSubmit={add}>
        <label>
          Name
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label>
          <input
            type="checkbox"
            checked={billable}
            onChange={(e) => setBillable(e.target.checked)}
          />
          Billable
        </label>
        <button type="submit">Add</button>
      </form>
      {message && <p role="alert">{message}</p>}
    </section>
  )
}
