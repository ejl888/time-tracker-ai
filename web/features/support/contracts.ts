import assert from 'node:assert/strict'
import type { Temporal } from 'temporal-polyfill'
import type { Contract } from '../../src/domain/records.ts'
import { parseHours, parseSignedHours } from '../../src/domain/timeText.ts'
import type { TimetrackerWorld } from './world.ts'

/** Minutes of a duration such as 36:00 or -1:00; fails the step if the text is not one. */
export function minutes(text: string): number {
  const value = parseSignedHours(text)
  assert.ok(value !== undefined, `not a duration: ${text}`)
  return value
}

/** Minutes of an unsigned duration such as 36:00. */
export function unsignedMinutes(text: string): number {
  const value = parseHours(text)
  assert.ok(value !== undefined, `not a duration: ${text}`)
  return value
}

/** The current contract; fails the step if there is none. */
export async function currentContract(
  world: TimetrackerWorld,
): Promise<Contract> {
  const contract = await world.contractService.current()
  assert.ok(contract, 'there is no contract')
  return contract
}

/** Sets the expected billable minutes of the period that starts on the date. */
export async function expectToBill(
  world: TimetrackerWorld,
  periodStart: Temporal.PlainDate,
  expected: number,
): Promise<void> {
  const contract = await currentContract(world)
  const result = await world.contractService.setExpected(
    contract,
    periodStart.toString(),
    expected,
  )
  assert.ok(
    result.ok,
    `could not set expected hours: ${JSON.stringify(result)}`,
  )
}
