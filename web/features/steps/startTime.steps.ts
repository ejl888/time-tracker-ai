import assert from 'node:assert/strict'
import { Then, When } from '@cucumber/cucumber'
import type { Temporal } from 'temporal-polyfill'
import type { TimetrackerWorld } from '../support/world.ts'

When(
  'I start a new entry on {date}',
  async function (this: TimetrackerWorld, date: Temporal.PlainDate) {
    this.prefill = await this.entryService.prefill(date)
  },
)

Then(
  'the start time is {time}',
  function (this: TimetrackerWorld, time: Temporal.PlainTime) {
    assert.ok(this.prefill, 'nothing is prefilled')
    assert.ok(
      this.prefill.start.equals(time),
      `the start time is ${this.prefill.start.toString()}, expected ${time.toString()}`,
    )
  },
)

Then(
  'the end time is {time}',
  function (this: TimetrackerWorld, time: Temporal.PlainTime) {
    assert.ok(this.prefill, 'nothing is prefilled')
    assert.ok(
      this.prefill.end.equals(time),
      `the end time is ${this.prefill.end.toString()}, expected ${time.toString()}`,
    )
  },
)

Then('nothing is prefilled', function (this: TimetrackerWorld) {
  assert.equal(
    this.prefill,
    undefined,
    `prefilled with ${JSON.stringify(this.prefill)}`,
  )
})
