import type { Clock } from './clock.ts'
import type { Entry, Label } from './records.ts'
import type { Repository } from './repository.ts'
import type { Result } from './result.ts'
import { newRecordFields, touch } from './recordFields.ts'

export type LabelError =
  'empty-name' | 'duplicate-name' | 'label-in-use' | 'not-found'

/** A listed label with whether an entry that is not deleted uses it. */
export interface ListedLabel {
  label: Label
  used: boolean
}

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
  entries: Repository<Entry>,
  clock: Clock,
) {
  /** Labels that are not deleted. */
  async function active(): Promise<Label[]> {
    const all = await labels.all()
    return all.filter((label) => !label.deleted)
  }

  /** The non-deleted label with this id, if any. */
  async function findActive(id: string): Promise<Label | undefined> {
    const label = await labels.get(id)
    return label && !label.deleted ? label : undefined
  }

  /** The ids of the labels that entries that are not deleted use. */
  async function usedLabelIds(): Promise<Set<string>> {
    const all = await entries.all()
    return new Set(
      all.filter((entry) => !entry.deleted).map((entry) => entry.labelId),
    )
  }

  /** Whether an entry that is not deleted uses the label. */
  async function isUsed(id: string): Promise<boolean> {
    return (await usedLabelIds()).has(id)
  }

  /** Labels that are not deleted, sorted by name. */
  async function list(): Promise<Label[]> {
    const existing = await active()
    return existing.sort((a, b) => a.name.localeCompare(b.name))
  }

  /**
   * Checks a normalized name against the label name rules.
   * The label with `exceptId` is ignored, so a label may keep its own name.
   */
  async function validateName(
    name: string,
    exceptId?: string,
  ): Promise<LabelError | undefined> {
    if (name === '') return 'empty-name'
    const existing = await active()
    const taken = existing.some(
      (label) => label.id !== exceptId && sameName(label.name, name),
    )
    return taken ? 'duplicate-name' : undefined
  }

  /**
   * Applies changes to an active label and saves it with a new `updatedAt`.
   * Changes that equal the stored values are not saved.
   */
  async function update(
    id: string,
    changes: Partial<Pick<Label, 'name' | 'billable' | 'deleted'>>,
  ): Promise<Result<Label, LabelError>> {
    const label = await findActive(id)
    if (!label) return { ok: false, error: 'not-found' }
    const unchanged = (Object.keys(changes) as (keyof typeof changes)[]).every(
      (key) => changes[key] === label[key],
    )
    if (unchanged) return { ok: true, value: label }
    const updated = touch(label, changes, clock)
    await labels.save(updated)
    return { ok: true, value: updated }
  }

  return {
    list,

    /** The label with this id, deleted or not. */
    get(id: string): Promise<Label | undefined> {
      return labels.get(id)
    },

    /**
     * The labels the entries use, deleted ones included, each once.
     * Label ids without a stored label are left out.
     */
    async usedBy(used: Entry[]): Promise<Label[]> {
      const ids = [...new Set(used.map((entry) => entry.labelId))]
      const found = await Promise.all(ids.map((id) => labels.get(id)))
      return found.filter((label) => label !== undefined)
    },

    /** Like `list`, with whether entries use each label. */
    async listWithUsage(): Promise<ListedLabel[]> {
      const [listed, used] = await Promise.all([list(), usedLabelIds()])
      return listed.map((label) => ({ label, used: used.has(label.id) }))
    },

    async create(
      rawName: string,
      { billable = true }: CreateLabelOptions = {},
    ): Promise<Result<Label, LabelError>> {
      const name = normalizeName(rawName)
      const error = await validateName(name)
      if (error) return { ok: false, error }
      const label: Label = {
        ...newRecordFields(clock),
        name,
        billable,
      }
      await labels.save(label)
      return { ok: true, value: label }
    },

    async rename(
      id: string,
      rawName: string,
    ): Promise<Result<Label, LabelError>> {
      if (!(await findActive(id))) return { ok: false, error: 'not-found' }
      const name = normalizeName(rawName)
      const error = await validateName(name, id)
      if (error) return { ok: false, error }
      return update(id, { name })
    },

    async setBillable(
      id: string,
      billable: boolean,
    ): Promise<Result<Label, LabelError>> {
      const label = await findActive(id)
      if (!label) return { ok: false, error: 'not-found' }
      if (label.billable !== billable && (await isUsed(id))) {
        return { ok: false, error: 'label-in-use' }
      }
      return update(id, { billable })
    },

    /** Soft deletes a label; entries that use it keep pointing to it. */
    remove(id: string): Promise<Result<Label, LabelError>> {
      return update(id, { deleted: true })
    },
  }
}

export type LabelService = ReturnType<typeof createLabelService>
