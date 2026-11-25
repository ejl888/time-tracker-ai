import assert from 'node:assert/strict'
import { Then } from '@cucumber/cucumber'
import type { Temporal } from 'temporal-polyfill'
import { workedInPeriod } from '../../src/domain/balance.ts'
import { periodOf } from '../../src/domain/contracts.ts'
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

Then(
  'the worked hours in the week of {date} are {duration}',
  async function (
    this: TimetrackerWorld,
    week: Temporal.PlainDate,
    duration: string,
  ) {
    // The Background may give only a start and a cycle, so the contract need not be saved.
    const { startDate, billingCycle } = this.contractFields
    assert.ok(startDate !== undefined, 'no contract start was given')
    assert.ok(billingCycle !== undefined, 'no billing cycle was given')
    const worked = workedInPeriod(
      { startDate },
      periodOf(week, billingCycle),
      await this.entries.all(),
      await this.labels.all(),
    )
    assert.equal(formatMinutes(worked.billable), duration)
  },
)
