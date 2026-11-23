import type { KeyboardEvent } from 'react'

/** A key handler for an editor form that calls `onCancel` when Esc is pressed. */
export function cancelOnEscape(onCancel: () => void) {
  return (event: KeyboardEvent<HTMLFormElement>) => {
    if (event.key !== 'Escape') return
    event.preventDefault()
    onCancel()
  }
}
