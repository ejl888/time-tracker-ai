import assert from 'node:assert/strict'
import { Given, Then, When } from '@cucumber/cucumber'
import type { Temporal } from 'temporal-polyfill'
import { billedMinutes } from '../../src/domain/contracts.ts'
import type {
  BillingCycle,
  ContractFields,
} from '../../src/domain/contracts.ts'
import type { Contract } from '../../src/domain/records.ts'
import {
  formatMinutes,
  parseHours,
  parseSignedHours,
} from '../../src/domain/timeText.ts'
import type { TimetrackerWorld } from '../support/world.ts'

const CYCLES: Record<string, BillingCycle> = {
  weekly: 'week',
  monthly: 'month',
}

/** Minutes of a duration such as 36:00; fails the step if the text is not one. */
function minutes(text: string): number {
  const value = parseSignedHours(text)
  assert.ok(value !== undefined, `not a duration: ${text}`)
  return value
}

/** Minutes of an unsigned duration such as 36:00. */
function unsignedMinutes(text: string): number {
  const value = parseHours(text)
  assert.ok(value !== undefined, `not a duration: ${text}`)
  return value
}

/** The current contract; fails the step if there is none. */
async function currentContract(world: TimetrackerWorld): Promise<Contract> {
  const contract = await world.contractService.current()
  assert.ok(contract, 'there is no contract')
  return contract
}

/** The fields of a saved contract, to change one of them. */
function fieldsOf(contract: Contract): ContractFields {
  return {
    startDate: contract.startDate,
    billingCycle: contract.billingCycle,
    billableLimit: contract.billableLimit,
    startingBalance: contract.startingBalance,
  }
}

/**
 * Adds Background fields to the contract and saves it once all fields are given.
 * Later calls (e.g. a second "a starting balance of …") update the saved contract.
 */
async function giveContractFields(
  world: TimetrackerWorld,
  fields: Partial<ContractFields>,
): Promise<void> {
  world.contractFields = { ...world.contractFields, ...fields }
  const { startDate, billingCycle, billableLimit, startingBalance } =
    world.contractFields
  if (
    startDate === undefined ||
    billingCycle === undefined ||
    billableLimit === undefined ||
    startingBalance === undefined
  ) {
    return
  }
  const result = await world.contractService.save({
    startDate,
    billingCycle,
    billableLimit,
    startingBalance,
  })
  assert.ok(result.ok, `could not save the contract: ${JSON.stringify(result)}`)
}

/** Saves the current contract with one field changed, as the change to check. */
async function changeContract(
  world: TimetrackerWorld,
  changes: Partial<ContractFields>,
): Promise<void> {
  const contract = await currentContract(world)
  world.lastResult = await world.contractService.save({
    ...fieldsOf(contract),
    ...changes,
  })
}

Given(
  /^a contract starting on (\d{4}-\d{2}-\d{2}) with a (weekly|monthly) billing cycle$/,
  async function (this: TimetrackerWorld, date: string, cycle: string) {
    await giveContractFields(this, {
      startDate: date,
      billingCycle: CYCLES[cycle],
    })
  },
)

Given(
  'a billable limit of {duration} per period',
  async function (this: TimetrackerWorld, limit: string) {
    await giveContractFields(this, { billableLimit: unsignedMinutes(limit) })
  },
)

Given(
  'a starting balance of {duration}',
  async function (this: TimetrackerWorld, balance: string) {
    await giveContractFields(this, { startingBalance: minutes(balance) })
  },
)

Given(
  'I expect to bill {duration} in the week of {date}',
  async function (
    this: TimetrackerWorld,
    expected: string,
    week: Temporal.PlainDate,
  ) {
    const contract = await currentContract(this)
    const result = await this.contractService.setExpected(
      contract,
      week.toString(),
      unsignedMinutes(expected),
    )
    assert.ok(
      result.ok,
      `could not set expected hours: ${JSON.stringify(result)}`,
    )
  },
)

When(
  /^I enter ([+-]?\d+:\d{2}) as the expected billable hours for the week of (\d{4}-\d{2}-\d{2})$/,
  async function (this: TimetrackerWorld, expected: string, week: string) {
    const contract = await currentContract(this)
    this.lastResult = await this.contractService.setExpected(
      contract,
      week,
      minutes(expected),
    )
  },
)

When(
  'I change the billable limit to {duration}',
  async function (this: TimetrackerWorld, limit: string) {
    await changeContract(this, { billableLimit: unsignedMinutes(limit) })
  },
)

When(
  /^I change the billing cycle to (weekly|monthly)$/,
  async function (this: TimetrackerWorld, cycle: string) {
    await changeContract(this, { billingCycle: CYCLES[cycle] })
  },
)

When(
  'I change the contract start to {date}',
  async function (this: TimetrackerWorld, date: Temporal.PlainDate) {
    await changeContract(this, { startDate: date.toString() })
  },
)

When(
  'I change the starting balance to {duration}',
  async function (this: TimetrackerWorld, balance: string) {
    await changeContract(this, { startingBalance: minutes(balance) })
  },
)

Then('the change is saved', function (this: TimetrackerWorld) {
  assert.ok(this.lastResult, 'no change was made')
  assert.ok(
    this.lastResult.ok,
    `the change was rejected: ${JSON.stringify(this.lastResult)}`,
  )
})

Then(
  'the billed hours for the week of {date} are {duration}',
  async function (
    this: TimetrackerWorld,
    week: Temporal.PlainDate,
    billed: string,
  ) {
    const contract = await currentContract(this)
    const expected = await this.contractService.expectedFor(
      contract,
      week.toString(),
    )
    assert.equal(
      formatMinutes(billedMinutes(contract.billableLimit, expected)),
      billed,
    )
  },
)
