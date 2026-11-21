import { systemClock } from './domain/clock.ts'
import { createLabelService } from './domain/labels.ts'
import type { Entry, Label } from './domain/records.ts'
import { LocalStorageRepository } from './storage/localStorageRepository.ts'

/** The app's services on their storage; the one place to swap repositories. */
export function createServices() {
  return {
    labels: createLabelService(
      new LocalStorageRepository<Label>('timetracker.labels'),
      new LocalStorageRepository<Entry>('timetracker.entries'),
      systemClock,
    ),
  }
}

export type Services = ReturnType<typeof createServices>
