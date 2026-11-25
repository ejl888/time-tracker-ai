import assert from 'node:assert/strict'
import { Given, Then } from '@cucumber/cucumber'
import type { DataTable } from '@cucumber/cucumber'
import { Temporal } from 'temporal-polyfill'
import {
  balanceBefore,
  periodResult,
  workedInPeriod,
} from '../../src/domain/balance.ts'
import type { PeriodResult } from '../../src/domain/balance.ts'
import { periodOf } from '../../src/domain/contracts.ts'
import type { Period } from '../../src/domain/contracts.ts'
import type { Contract } from '../../src/domain/records.ts'
import {
  formatMinutes,
  formatSignedMinutes,
} from '../../src/domain/timeText.ts'
import {
  currentContract,
  expectToBill,
  minutes,
  unsignedMinutes,
} from '../support/contracts.ts'
import { parseMonth } from '../support/parameterTypes.ts'
import { TEST_LABEL, ZONE } from '../support/world.ts'
import type { TimetrackerWorld } from '../support/world.ts'

/** Worked hours are added as entries from 08:00 of at most 10:00 a day. */
const WORK_START = Temporal.PlainTime.from('08:00')
const MAX_MINUTES_PER_DAY = 10 * 60

/** The contract with its period that contains the date. */
async function contractPeriod(
  world: TimetrackerWorld,
  date: Temporal.PlainDate,
): Promise<{ contract: Contract; period: Period }> {
  const contract = await currentContract(world)
  return { contract, period: periodOf(date, contract.billingCycle) }
}

/** The later of the period start and the contract start. */
function firstWorkDay(contract: Contract, period: Period): Temporal.PlainDate {
  const start = Temporal.PlainDate.from(contract.startDate)
  return Temporal.PlainDate.compare(start, period.start) > 0
    ? start
    : period.start
}

/** Adds billable entries for the worked minutes on consecutive days of the period; fails if they do not fit. */
async function work(
  world: TimetrackerWorld,
  date: Temporal.PlainDate,
  worked: number,
): Promise<void> {
  const { contract, period } = await contractPeriod(world, date)
  await world.ensureTestLabel()
  const label = await world.findLabel(TEST_LABEL)
  assert.ok(label, 'there is no test label')
  let day = firstWorkDay(contract, period)
  let left = worked
  while (left > 0) {
    assert.ok(
      Temporal.PlainDate.compare(day, period.end) <= 0,
      `${formatMinutes(worked)} does not fit in the period of ${date.toString()}`,
    )
    const chunk = Math.min(left, MAX_MINUTES_PER_DAY)
    const result = await world.entryService.add({
      date: day,
      start: WORK_START,
      end: WORK_START.add({ minutes: chunk }),
      labelId: label.id,
      description: '',
      timeZone: ZONE,
    })
    assert.ok(
      result.ok,
      `could not add the entry on ${day.toString()}: ${JSON.stringify(result)}`,
    )
    left -= chunk
    day = day.add({ days: 1 })
  }
}

/** The balance carried into the period that contains the date. */
async function carriedInto(
  world: TimetrackerWorld,
  date: Temporal.PlainDate,
): Promise<number> {
  const { contract, period } = await contractPeriod(world, date)
  return balanceBefore(
    contract,
    period,
    await world.contractService.expectedRecords(contract),
    await world.entries.all(),
    await world.labels.all(),
  )
}

/** What the period that contains the date comes to. */
async function resultOf(
  world: TimetrackerWorld,
  date: Temporal.PlainDate,
): Promise<PeriodResult> {
  const { contract, period } = await contractPeriod(world, date)
  const expected = await world.contractService.expectedFor(
    contract,
    period.start.toString(),
  )
  const worked = workedInPeriod(
    contract,
    period,
    await world.entries.all(),
    await world.labels.all(),
  )
  return periodResult(
    contract.billableLimit,
    expected,
    await carriedInto(world, date),
    worked.billable,
  )
}

/** The balance after the period that contains the date, e.g. +8:00. */
async function balanceTextAfter(
  world: TimetrackerWorld,
  date: Temporal.PlainDate,
): Promise<string> {
  return formatSignedMinutes((await resultOf(world, date)).balanceAfter)
}

/** Sets the expected hours and adds the worked hours of each row. */
async function givePeriods(
  world: TimetrackerWorld,
  table: DataTable,
  dateOfRow: (row: Record<string, string>) => Temporal.PlainDate,
): Promise<void> {
  for (const row of table.hashes()) {
    const date = dateOfRow(row)
    await expectToBill(world, date, unsignedMinutes(row.expected))
    await work(world, date, unsignedMinutes(row.worked))
  }
}

/** Checks the balance after the period of each row; the table is compared as a whole. */
async function checkBalances(
  world: TimetrackerWorld,
  table: DataTable,
  dateOfRow: (row: Record<string, string>) => Temporal.PlainDate,
): Promise<void> {
  const rows = table.hashes()
  const actual: Record<string, string>[] = []
  for (const row of rows) {
    actual.push({
      ...row,
      balance: await balanceTextAfter(world, dateOfRow(row)),
    })
  }
  assert.deepEqual(actual, rows)
}

const weekOfRow = (row: Record<string, string>) =>
  Temporal.PlainDate.from(row['week of'])
const monthOfRow = (row: Record<string, string>) => parseMonth(row.month)

Given(
  'these weeks:',
  async function (this: TimetrackerWorld, table: DataTable) {
    await givePeriods(this, table, weekOfRow)
  },
)

Given(
  'these months:',
  async function (this: TimetrackerWorld, table: DataTable) {
    await givePeriods(this, table, monthOfRow)
  },
)

Given(
  'I worked {duration} in the week of {date}',
  async function (
    this: TimetrackerWorld,
    worked: string,
    week: Temporal.PlainDate,
  ) {
    await work(this, week, unsignedMinutes(worked))
  },
)

Given(
  'I expect to bill {duration} in {month}',
  async function (
    this: TimetrackerWorld,
    expected: string,
    month: Temporal.PlainDate,
  ) {
    await expectToBill(this, month, unsignedMinutes(expected))
  },
)

Then(
  'the billed hours for {month} are {duration}',
  async function (
    this: TimetrackerWorld,
    month: Temporal.PlainDate,
    expected: string,
  ) {
    const { billed } = await resultOf(this, month)
    assert.equal(formatMinutes(billed), expected)
  },
)

Then(
  'the balance after each week is:',
  async function (this: TimetrackerWorld, table: DataTable) {
    await checkBalances(this, table, weekOfRow)
  },
)

Then(
  'the balance after each month is:',
  async function (this: TimetrackerWorld, table: DataTable) {
    await checkBalances(this, table, monthOfRow)
  },
)

Then(
  'the balance after the week of {date} is {signed}',
  async function (
    this: TimetrackerWorld,
    week: Temporal.PlainDate,
    expected: string,
  ) {
    assert.equal(await balanceTextAfter(this, week), expected)
  },
)

Then(
  'the balance after {month} is {signed}',
  async function (
    this: TimetrackerWorld,
    month: Temporal.PlainDate,
    expected: string,
  ) {
    assert.equal(await balanceTextAfter(this, month), expected)
  },
)

Then(
  'the balance carried into the week of {date} is {signed}',
  async function (
    this: TimetrackerWorld,
    week: Temporal.PlainDate,
    expected: string,
  ) {
    assert.equal(formatSignedMinutes(await carriedInto(this, week)), expected)
  },
)

Then(
  'the hours left to work in the week of {date} are {signed}',
  async function (
    this: TimetrackerWorld,
    week: Temporal.PlainDate,
    expected: string,
  ) {
    const { left } = await resultOf(this, week)
    assert.equal(left, minutes(expected))
  },
)
