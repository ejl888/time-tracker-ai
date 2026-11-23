import { systemClock } from './domain/clock.ts'
import { createContractService } from './domain/contracts.ts'
import { createEntryService } from './domain/entries.ts'
import { createLabelService } from './domain/labels.ts'
import type { Contract, Entry, ExpectedHours, Label } from './domain/records.ts'
import { LocalStorageRepository } from './storage/localStorageRepository.ts'

/** The app's services on their storage; the one place to swap repositories. */
export function createServices() {
  const entries = new LocalStorageRepository<Entry>('timetracker.entries')
  return {
    labels: createLabelService(
      new LocalStorageRepository<Label>('timetracker.labels'),
      entries,
      systemClock,
    ),
    entries: createEntryService(entries, systemClock),
    contracts: createContractService(
      new LocalStorageRepository<Contract>('timetracker.contracts'),
      new LocalStorageRepository<ExpectedHours>('timetracker.expectedHours'),
      systemClock,
    ),
  }
}

export type Services = ReturnType<typeof createServices>
