import { setWorldConstructor, World } from '@cucumber/cucumber'
import type { IWorldOptions } from '@cucumber/cucumber'
import { Temporal } from 'temporal-polyfill'
import { fixedClock } from '../../src/domain/clock.ts'
import type { Clock } from '../../src/domain/clock.ts'
import { createEntryService } from '../../src/domain/entries.ts'
import type { ClockChangeNote, Prefill } from '../../src/domain/entries.ts'
import { createLabelService } from '../../src/domain/labels.ts'
import type { LabelService } from '../../src/domain/labels.ts'
import type { Entry, Label } from '../../src/domain/records.ts'
import { InMemoryRepository } from '../../src/domain/repository.ts'
import type { Result } from '../../src/domain/result.ts'

/** Wall-clock times in the specs are in this zone. */
export const ZONE = 'Europe/Amsterdam'

/** "Today" in the specs is this time of day in ZONE. */
const TIME_OF_DAY = Temporal.PlainTime.from('12:00')

type EntryService = ReturnType<typeof createEntryService>

/** Name of the hidden billable label for entries in a table without a label column. */
export const TEST_LABEL = 'Test'

export class TimetrackerWorld extends World {
  labels = new InMemoryRepository<Label>()
  entries = new InMemoryRepository<Entry>()
  clock: Clock
  labelService: LabelService
  /** Shares the entries repository with the label service, so labels see their entries. */
  entryService: EntryService
  /** The last entry added: "that entry". */
  lastEntry: Entry | undefined
  /** The result of the last action that can be rejected. */
  lastResult: Result<unknown, unknown> | undefined
  /** The prefill of the last new entry that was started. */
  prefill: Prefill | undefined
  /** The clock-change notes for the times of the last entry entered, which is not saved. */
  clockChangeNotes: ClockChangeNote[] | undefined
  private hasTestLabel = false

  constructor(options: IWorldOptions) {
    super(options)
    this.clock = fixedClock(Temporal.Instant.from('2026-01-01T12:00:00Z'))
    this.labelService = this.buildLabelService()
    this.entryService = this.buildEntryService()
  }

  /** Sets a fixed clock at TIME_OF_DAY on the given date in ZONE. */
  setToday(date: Temporal.PlainDate) {
    const instant = date
      .toZonedDateTime({ timeZone: ZONE, plainTime: TIME_OF_DAY })
      .toInstant()
    this.clock = fixedClock(instant)
    this.labelService = this.buildLabelService()
    this.entryService = this.buildEntryService()
  }

  /** The label with this name that is not deleted, if any. */
  async findLabel(name: string): Promise<Label | undefined> {
    const labels = await this.labelService.list()
    return labels.find((label) => label.name === name)
  }

  /** Creates the billable test label the first time it is needed in a scenario. */
  async ensureTestLabel(): Promise<void> {
    if (this.hasTestLabel) return
    const result = await this.labelService.create(TEST_LABEL)
    if (!result.ok) {
      throw new Error(`could not create the test label: ${result.error}`)
    }
    this.hasTestLabel = true
  }

  private buildLabelService() {
    return createLabelService(this.labels, this.entries, this.clock)
  }

  private buildEntryService() {
    return createEntryService(this.entries, this.clock)
  }
}

setWorldConstructor(TimetrackerWorld)
