import type { Clock } from './clock.ts'
import type { Entry, Label } from './records.ts'
import type { Repository } from './repository.ts'
import type { Result } from './result.ts'

export type LabelError = never

export interface CreateLabelOptions {
  billable?: boolean
}

export function createLabelService(
  labels: Repository<Label>,
  _entries: Repository<Entry>,
  clock: Clock,
) {
  return {
    /** Labels that are not deleted, sorted by name. */
    async list(): Promise<Label[]> {
      const all = await labels.all()
      return all
        .filter((label) => !label.deleted)
        .sort((a, b) => a.name.localeCompare(b.name))
    },

    async create(
      name: string,
      { billable = true }: CreateLabelOptions = {},
    ): Promise<Result<Label, LabelError>> {
      const now = clock.now().toString({ smallestUnit: 'millisecond' })
      const label: Label = {
        id: crypto.randomUUID(),
        createdAt: now,
        updatedAt: now,
        deleted: false,
        name,
        billable,
      }
      await labels.save(label)
      return { ok: true, value: label }
    },
  }
}
