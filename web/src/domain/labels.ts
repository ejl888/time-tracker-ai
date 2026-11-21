import type { Clock } from './clock.ts'
import type { Entry, Label } from './records.ts'
import type { Repository } from './repository.ts'
import type { Result } from './result.ts'

export type LabelError = 'empty-name' | 'duplicate-name'

export interface CreateLabelOptions {
  billable?: boolean
}

/** Removes the spaces around a label name. */
export function normalizeName(name: string): string {
  return name.trim()
}

/**
 * Whether two label names are the same, ignoring case and surrounding spaces.
 * Compares the Unicode lower case, independent of the locale; accents count.
 */
export function sameName(a: string, b: string): boolean {
  return normalizeName(a).toLowerCase() === normalizeName(b).toLowerCase()
}

export function createLabelService(
  labels: Repository<Label>,
  _entries: Repository<Entry>,
  clock: Clock,
) {
  /** Labels that are not deleted. */
  async function active(): Promise<Label[]> {
    const all = await labels.all()
    return all.filter((label) => !label.deleted)
  }

  /** Checks a normalized name against the label name rules. */
  async function validateName(name: string): Promise<LabelError | undefined> {
    if (name === '') return 'empty-name'
    const existing = await active()
    const taken = existing.some((label) => sameName(label.name, name))
    return taken ? 'duplicate-name' : undefined
  }

  return {
    /** Labels that are not deleted, sorted by name. */
    async list(): Promise<Label[]> {
      const existing = await active()
      return existing.sort((a, b) => a.name.localeCompare(b.name))
    },

    async create(
      rawName: string,
      { billable = true }: CreateLabelOptions = {},
    ): Promise<Result<Label, LabelError>> {
      const name = normalizeName(rawName)
      const error = await validateName(name)
      if (error) return { ok: false, error }
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
