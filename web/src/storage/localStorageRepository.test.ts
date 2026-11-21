import { beforeEach, expect, test } from 'vitest'
import type { Label } from '../domain/records.ts'
import { LocalStorageRepository } from './localStorageRepository.ts'

const KEY = 'timetracker.labels'

function label(overrides: Partial<Label> = {}): Label {
  return {
    id: '7f8c2a4e-1b3d-4e5f-9a6b-0c1d2e3f4a5b',
    createdAt: '2026-11-18T08:00:00.000Z',
    updatedAt: '2026-11-18T08:00:00.000Z',
    deleted: false,
    name: 'Klant A',
    billable: true,
    ...overrides,
  }
}

beforeEach(() => {
  localStorage.clear()
})

test('all() is empty when nothing is stored', async () => {
  expect(await new LocalStorageRepository<Label>(KEY).all()).toEqual([])
})

test('a saved record survives a reload and is stored as a JSON array', async () => {
  const record = label()
  await new LocalStorageRepository<Label>(KEY).save(record)

  const reloaded = new LocalStorageRepository<Label>(KEY)
  expect(await reloaded.all()).toEqual([record])
  expect(await reloaded.get(record.id)).toEqual(record)
  expect(JSON.parse(localStorage.getItem(KEY) ?? 'null')).toEqual([record])
})

test('saving a record with an existing id replaces it', async () => {
  const repository = new LocalStorageRepository<Label>(KEY)
  await repository.save(label())
  const renamed = label({
    name: 'Klant B',
    updatedAt: '2026-11-18T09:00:00.000Z',
  })
  await repository.save(renamed)

  expect(await repository.all()).toEqual([renamed])
})

test('deleted records are kept and returned by all()', async () => {
  const repository = new LocalStorageRepository<Label>(KEY)
  const deleted = label({ deleted: true })
  await repository.save(deleted)

  expect(await new LocalStorageRepository<Label>(KEY).all()).toEqual([deleted])
})

test('saving sets the schema version to 1', async () => {
  await new LocalStorageRepository<Label>(KEY).save(label())

  expect(localStorage.getItem('timetracker.schemaVersion')).toBe('1')
})

test('repositories on different keys do not see each other', async () => {
  const labels = new LocalStorageRepository<Label>('timetracker.labels')
  const entries = new LocalStorageRepository<Label>('timetracker.entries')
  const record = label()
  await labels.save(record)

  expect(await entries.all()).toEqual([])
  expect(await entries.get(record.id)).toBeUndefined()
  expect(await labels.all()).toEqual([record])
})
