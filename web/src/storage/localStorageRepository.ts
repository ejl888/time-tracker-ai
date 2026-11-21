import type { BaseRecord } from '../domain/records.ts'
import type { Repository } from '../domain/repository.ts'

const SCHEMA_VERSION_KEY = 'timetracker.schemaVersion'
const SCHEMA_VERSION = '1'

/** Keeps the records of one type as a JSON array under one localStorage key. */
export class LocalStorageRepository<
  T extends BaseRecord,
> implements Repository<T> {
  private readonly key: string
  private readonly storage: Storage

  constructor(key: string, storage: Storage = localStorage) {
    this.key = key
    this.storage = storage
  }

  async all(): Promise<T[]> {
    return this.read()
  }

  async get(id: string): Promise<T | undefined> {
    return this.read().find((record) => record.id === id)
  }

  async save(record: T): Promise<void> {
    const records = this.read()
    const index = records.findIndex((stored) => stored.id === record.id)
    if (index === -1) records.push(record)
    else records[index] = record
    this.storage.setItem(this.key, JSON.stringify(records))
    this.storage.setItem(SCHEMA_VERSION_KEY, SCHEMA_VERSION)
  }

  private read(): T[] {
    const json = this.storage.getItem(this.key)
    return json === null ? [] : (JSON.parse(json) as T[])
  }
}
