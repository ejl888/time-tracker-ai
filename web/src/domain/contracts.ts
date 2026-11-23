import { Temporal } from 'temporal-polyfill'
import type { Clock } from './clock.ts'
import type { Contract, ExpectedHours, IsoDate } from './records.ts'
import { newRecordFields, touch } from './recordFields.ts'
import type { Repository } from './repository.ts'
import type { Result } from './result.ts'

export type BillingCycle = Contract['billingCycle']

/** The contract fields that can be set. */
export type ContractFields = Pick<
  Contract,
  'startDate' | 'billingCycle' | 'billableLimit' | 'startingBalance'
>

export type ContractError =
  'limit-not-positive' | 'contract-locked' | 'negative' | 'not-a-period-start'

/** Fields that cannot change once expected hours exist for the contract. */
const LOCKED_FIELDS = ['billingCycle', 'startDate', 'billableLimit'] as const

/** A billing period: first and last day, plus the ISO week number for weeks. */
export interface Period {
  start: Temporal.PlainDate
  end: Temporal.PlainDate
  week?: number
}

/** The week (Monday–Sunday) or calendar month that contains the date. */
export function periodOf(
  date: Temporal.PlainDate,
  cycle: BillingCycle,
): Period {
  if (cycle === 'month') {
    const start = date.with({ day: 1 })
    return { start, end: date.with({ day: date.daysInMonth }) }
  }
  const start = date.subtract({ days: date.dayOfWeek - 1 })
  return { start, end: start.add({ days: 6 }), week: date.weekOfYear }
}

/** Billed minutes of a period: the expected minutes capped at the limit; nothing entered is 0. */
export function billedMinutes(
  limit: number,
  expected: number | undefined,
): number {
  return Math.min(limit, expected ?? 0)
}

/** Whether the date is the first day of a period of the cycle. */
function isPeriodStart(date: IsoDate, cycle: BillingCycle): boolean {
  const day = Temporal.PlainDate.from(date)
  return periodOf(day, cycle).start.equals(day)
}

/** Whether saving `fields` would change any of the record's `keys`. */
function changes<T, K extends keyof T>(
  record: T,
  fields: Pick<T, K>,
  keys: readonly K[],
): boolean {
  return keys.some((key) => record[key] !== fields[key])
}

export function createContractService(
  contracts: Repository<Contract>,
  expectedHours: Repository<ExpectedHours>,
  clock: Clock,
) {
  /** The contract that is not deleted, if any; there is one contract for now. */
  async function current(): Promise<Contract | undefined> {
    const all = await contracts.all()
    return all.find((contract) => !contract.deleted)
  }

  /** The active expected hours of the contract. */
  async function activeExpected(contract: Contract): Promise<ExpectedHours[]> {
    const all = await expectedHours.all()
    return all.filter(
      (record) => !record.deleted && record.contractId === contract.id,
    )
  }

  /** The active expected hours of the contract for the period, if any. */
  async function findExpected(
    contract: Contract,
    periodStart: IsoDate,
  ): Promise<ExpectedHours | undefined> {
    const active = await activeExpected(contract)
    return active.find((record) => record.periodStart === periodStart)
  }

  /** Updates the contract; cycle, start and limit are locked once expected hours exist. */
  async function update(
    contract: Contract,
    fields: ContractFields,
  ): Promise<Result<Contract, ContractError>> {
    const keys = Object.keys(fields) as (keyof ContractFields)[]
    if (!changes(contract, fields, keys)) return { ok: true, value: contract }
    if (
      changes(contract, fields, LOCKED_FIELDS) &&
      (await activeExpected(contract)).length > 0
    ) {
      return { ok: false, error: 'contract-locked' }
    }
    const updated = touch(contract, fields, clock)
    await contracts.save(updated)
    return { ok: true, value: updated }
  }

  /** Creates the contract, ongoing until an end date is set. */
  async function create(
    fields: ContractFields,
  ): Promise<Result<Contract, ContractError>> {
    const contract: Contract = {
      ...newRecordFields(clock),
      ...fields,
      endDate: null,
    }
    await contracts.save(contract)
    return { ok: true, value: contract }
  }

  /** Stores new expected hours for the period; nothing to store when cleared. */
  async function addExpected(
    contract: Contract,
    periodStart: IsoDate,
    expected: number | undefined,
  ): Promise<ExpectedHours | undefined> {
    if (expected === undefined) return undefined
    const record: ExpectedHours = {
      ...newRecordFields(clock),
      contractId: contract.id,
      periodStart,
      expected,
    }
    await expectedHours.save(record)
    return record
  }

  /** Changes stored expected hours; `undefined` soft-deletes them. Same value: not saved. */
  async function changeExpected(
    record: ExpectedHours,
    expected: number | undefined,
  ): Promise<ExpectedHours> {
    if (record.expected === expected) return record
    const changed = touch(
      record,
      expected === undefined ? { deleted: true } : { expected },
      clock,
    )
    await expectedHours.save(changed)
    return changed
  }

  return {
    current,

    /** Creates the contract or updates the current one. */
    async save(
      fields: ContractFields,
    ): Promise<Result<Contract, ContractError>> {
      if (fields.billableLimit <= 0) {
        return { ok: false, error: 'limit-not-positive' }
      }
      const existing = await current()
      return existing ? update(existing, fields) : create(fields)
    },

    /** The expected minutes of the period, or undefined when none are entered. */
    async expectedFor(
      contract: Contract,
      periodStart: IsoDate,
    ): Promise<number | undefined> {
      return (await findExpected(contract, periodStart))?.expected
    },

    /**
     * Sets the expected minutes of the period; `undefined` clears them (soft delete).
     * The result holds the stored record, or undefined when there was nothing to clear.
     */
    async setExpected(
      contract: Contract,
      periodStart: IsoDate,
      expected: number | undefined,
    ): Promise<Result<ExpectedHours | undefined, ContractError>> {
      if (expected !== undefined && expected < 0) {
        return { ok: false, error: 'negative' }
      }
      if (!isPeriodStart(periodStart, contract.billingCycle)) {
        return { ok: false, error: 'not-a-period-start' }
      }
      const existing = await findExpected(contract, periodStart)
      const value = existing
        ? await changeExpected(existing, expected)
        : await addExpected(contract, periodStart, expected)
      return { ok: true, value }
    },
  }
}

export type ContractService = ReturnType<typeof createContractService>
