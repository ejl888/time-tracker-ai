import { beforeEach, expect, test } from 'vitest'
import { Temporal } from 'temporal-polyfill'
import type { Clock } from './clock.ts'
import { createLabelService } from './labels.ts'
import type { Entry, Label } from './records.ts'
import { InMemoryRepository } from './repository.ts'

const t1 = Temporal.Instant.from('2026-03-02T09:00:00Z')
const t2 = Temporal.Instant.from('2026-03-02T10:00:00Z')
const t1Iso = '2026-03-02T09:00:00.000Z'
const t2Iso = '2026-03-02T10:00:00.000Z'

let current: Temporal.Instant
let labels: InMemoryRepository<Label>
let service: ReturnType<typeof createLabelService>
let id: string

beforeEach(async () => {
  current = t1
  const clock: Clock = { now: () => current }
  labels = new InMemoryRepository<Label>()
  service = createLabelService(labels, new InMemoryRepository<Entry>(), clock)
  const created = await service.create('Support', { billable: true })
  if (!created.ok) throw new Error(`create failed: ${created.error}`)
  id = created.value.id
  current = t2
})

test('renaming to the same name does not save', async () => {
  const result = await service.rename(id, 'Support')

  expect(result.ok).toBe(true)
  expect((await labels.get(id))?.updatedAt).toBe(t1Iso)
})

test('renaming to the same name with surrounding spaces does not save', async () => {
  const result = await service.rename(id, '  Support ')

  expect(result.ok).toBe(true)
  const stored = await labels.get(id)
  expect(stored?.name).toBe('Support')
  expect(stored?.updatedAt).toBe(t1Iso)
})

test('setting billable to its current value does not save', async () => {
  const result = await service.setBillable(id, true)

  expect(result.ok).toBe(true)
  expect((await labels.get(id))?.updatedAt).toBe(t1Iso)
})

test('renaming to a different name saves with a new updatedAt', async () => {
  const result = await service.rename(id, 'Helpdesk')

  expect(result.ok).toBe(true)
  const stored = await labels.get(id)
  expect(stored?.name).toBe('Helpdesk')
  expect(stored?.updatedAt).toBe(t2Iso)
})

test('renaming to a different casing is a change and saves', async () => {
  const result = await service.rename(id, 'SUPPORT')

  expect(result.ok).toBe(true)
  const stored = await labels.get(id)
  expect(stored?.name).toBe('SUPPORT')
  expect(stored?.updatedAt).toBe(t2Iso)
})
