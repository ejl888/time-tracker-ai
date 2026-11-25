import assert from 'node:assert/strict'
import { Then, When } from '@cucumber/cucumber'
import type { DataTable } from '@cucumber/cucumber'
import type { Temporal } from 'temporal-polyfill'
import { periodOf } from '../../src/domain/contracts.ts'
import { todayIn } from '../../src/domain/entries.ts'
import {
  canGoBack,
  canGoForward,
  daysShown,
  firstPeriod,
  openDay,
  overviewCycle,
  shiftPeriod,
} from '../../src/domain/overview.ts'
import { ZONE } from '../support/world.ts'
import type { OpenOverview, TimetrackerWorld } from '../support/world.ts'

/** The open overview; fails the step if it is not opened yet. */
function overviewOf(world: TimetrackerWorld): OpenOverview {
  assert.ok(world.overview, 'the overview is not open')
  return world.overview
}

/** Whether the overview can go to the previous or next period. */
function canGo(overview: OpenOverview, direction: string): boolean {
  const { period, first, today } = overview
  return direction === 'previous'
    ? canGoBack(period, first)
    : canGoForward(period, today)
}

/** The dates of the days the overview shows, in the order shown. */
function datesShown(overview: OpenOverview): string[] {
  return daysShown(overview.period, overview.today).map(String)
}

When('I open the overview', async function (this: TimetrackerWorld) {
  const contract = await this.contractService.current()
  const earliest = await this.entryService.firstDate()
  const today = todayIn(this.clock.now(), ZONE)
  const cycle = overviewCycle(contract)
  this.overview = {
    period: periodOf(today, cycle),
    first: firstPeriod(contract, earliest, today),
    cycle,
    today,
  }
})

When(
  /^I go to the (previous|next) period$/,
  function (this: TimetrackerWorld, direction: string) {
    const overview = overviewOf(this)
    assert.ok(
      canGo(overview, direction),
      `cannot go to the ${direction} period`,
    )
    const { period, cycle } = overview
    this.overview = {
      ...overview,
      period: shiftPeriod(period, cycle, direction === 'previous' ? -1 : 1),
    }
  },
)

Then(
  'the days shown are:',
  function (this: TimetrackerWorld, table: DataTable) {
    const expected = table.hashes().map((row) => row.date)
    assert.deepEqual(datesShown(overviewOf(this)), expected)
  },
)

Then(
  '{int} days are shown, from {date} to {date}',
  function (
    this: TimetrackerWorld,
    count: number,
    newest: Temporal.PlainDate,
    oldest: Temporal.PlainDate,
  ) {
    const dates = datesShown(overviewOf(this))
    assert.equal(dates.length, count)
    assert.equal(dates.at(0), newest.toString())
    assert.equal(dates.at(-1), oldest.toString())
  },
)

Then(
  'the open day is {date}',
  function (this: TimetrackerWorld, date: Temporal.PlainDate) {
    const { period, today } = overviewOf(this)
    assert.equal(openDay(period, today).toString(), date.toString())
  },
)

Then(
  /^I (can|cannot) go to the (previous|next) period$/,
  function (this: TimetrackerWorld, can: string, direction: string) {
    assert.equal(canGo(overviewOf(this), direction), can === 'can')
  },
)
