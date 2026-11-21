import assert from 'node:assert/strict'
import { Then } from '@cucumber/cucumber'
import type { Temporal } from 'temporal-polyfill'
import { formatMinutes, workedMinutesOn } from '../../src/domain/workedHours.ts'
import type { TimetrackerWorld } from '../support/world.ts'

Then(
  'the worked hours on {date} are {duration}',
  async function (
    this: TimetrackerWorld,
    date: Temporal.PlainDate,
    duration: string,
  ) {
    const minutes = workedMinutesOn(
      date,
      await this.entries.all(),
      await this.labels.all(),
    )
    assert.equal(formatMinutes(minutes), duration)
  },
)
