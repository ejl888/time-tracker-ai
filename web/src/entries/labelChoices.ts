import type { Label } from '../domain/records.ts'
import type { LabelChoice } from './EntryForm.tsx'

/** The labels as choices of the Label dropdown, in the same order. */
export function choicesOf(labels: Label[]): LabelChoice[] {
  return labels.map((label) => ({
    value: label.id,
    name: label.name,
    billable: label.billable,
  }))
}
