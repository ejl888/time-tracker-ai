import type { BaseRecord } from './records.ts'

/** Data access for one record type. `all()` includes deleted records. */
export interface Repository<T extends BaseRecord> {
  all(): Promise<T[]>
  get(id: string): Promise<T | undefined>
  save(record: T): Promise<void>
}

/** Keeps records in memory; used by the specs and UI tests. */
export class InMemoryRepository<T extends BaseRecord> implements Repository<T> {
  private readonly records = new Map<string, T>()

  async all(): Promise<T[]> {
    return [...this.records.values()]
  }

  async get(id: string): Promise<T | undefined> {
    return this.records.get(id)
  }

  async save(record: T): Promise<void> {
    this.records.set(record.id, record)
  }
}
