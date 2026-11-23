import { beforeEach, describe, expect, test } from 'vitest'
import { Temporal } from 'temporal-polyfill'
import type { Clock } from './clock.ts'
import { billedMinutes, createContractService, periodOf } from './contracts.ts'
import type { ContractFields } from './contracts.ts'
import type { Contract, ExpectedHours } from './records.ts'
import { InMemoryRepository } from './repository.ts'

const date = (text: string) => Temporal.PlainDate.from(text)

const describePeriod = (period: ReturnType<typeof periodOf>) => ({
  start: period.start.toString(),
  end: period.end.toString(),
  week: period.week,
})

test.each([
  ['2026-11-23', '2026-11-23', '2026-11-29', 48],
  ['2026-11-25', '2026-11-23', '2026-11-29', 48],
  ['2026-11-29', '2026-11-23', '2026-11-29', 48],
  ['2026-12-31', '2026-12-28', '2027-01-03', 53],
  ['2027-01-03', '2026-12-28', '2027-01-03', 53],
  ['2027-01-04', '2027-01-04', '2027-01-10', 1],
])(
  'the week of %s runs from Monday %s to Sunday %s (week %i)',
  (day, start, end, week) => {
    expect(describePeriod(periodOf(date(day), 'week'))).toEqual({
      start,
      end,
      week,
    })
  },
)

test.each([
  ['2026-11-23', '2026-11-01', '2026-11-30'],
  ['2026-11-01', '2026-11-01', '2026-11-30'],
  ['2026-12-31', '2026-12-01', '2026-12-31'],
  ['2028-02-10', '2028-02-01', '2028-02-29'],
  ['2027-02-10', '2027-02-01', '2027-02-28'],
])('the month of %s runs from %s to %s', (day, start, end) => {
  const period = periodOf(date(day), 'month')
  expect(describePeriod(period)).toEqual({ start, end, week: undefined })
  expect(period.week).toBeUndefined()
})

test('periodOf returns Temporal.PlainDate values', () => {
  const period = periodOf(date('2026-11-25'), 'week')
  expect(period.start).toBeInstanceOf(Temporal.PlainDate)
  expect(period.end).toBeInstanceOf(Temporal.PlainDate)
})

test.each([
  [2160, 2160, 2160],
  [2160, 1920, 1920],
  [2160, 0, 0],
  [2160, 2400, 2160],
  [2160, undefined, 0],
])('billedMinutes(limit %i, expected %s) is %i', (limit, expected, billed) => {
  expect(billedMinutes(limit, expected)).toBe(billed)
})

describe('contract service', () => {
  const t1 = Temporal.Instant.from('2026-10-05T09:00:00Z')
  const t2 = Temporal.Instant.from('2026-10-05T10:00:00Z')
  const t2Iso = '2026-10-05T10:00:00.000Z'

  const fields: ContractFields = {
    startDate: '2026-10-05',
    billingCycle: 'week',
    billableLimit: 2160,
    startingBalance: 0,
  }

  let now: Temporal.Instant
  let contracts: InMemoryRepository<Contract>
  let expectedHours: InMemoryRepository<ExpectedHours>
  let service: ReturnType<typeof createContractService>

  beforeEach(() => {
    now = t1
    const clock: Clock = { now: () => now }
    contracts = new InMemoryRepository<Contract>()
    expectedHours = new InMemoryRepository<ExpectedHours>()
    service = createContractService(contracts, expectedHours, clock)
  })

  /** Creates the contract with `fields`; fails the test if it is rejected. */
  async function createContract(): Promise<Contract> {
    const result = await service.save(fields)
    if (!result.ok) throw new Error(`save failed: ${result.error}`)
    return result.value
  }

  /** Creates the contract with expected hours in its first week, so it is locked. */
  async function lockedContract(): Promise<Contract> {
    const contract = await createContract()
    const result = await service.setExpected(contract, '2026-10-05', 2160)
    if (!result.ok) throw new Error(`setExpected failed: ${result.error}`)
    return contract
  }

  test('there is no contract until one is saved', async () => {
    expect(await service.current()).toBeUndefined()
  })

  test('saving creates the contract, which current() returns', async () => {
    const result = await service.save(fields)

    expect(result.ok).toBe(true)
    const contract = await service.current()
    expect(contract).toMatchObject({
      ...fields,
      endDate: null,
      deleted: false,
    })
    expect(await contracts.all()).toHaveLength(1)
  })

  test('saving again updates the one contract', async () => {
    const created = await createContract()
    now = t2

    const result = await service.save({ ...fields, billableLimit: 1920 })

    expect(result.ok).toBe(true)
    expect(await contracts.all()).toHaveLength(1)
    const contract = await service.current()
    expect(contract?.id).toBe(created.id)
    expect(contract?.billableLimit).toBe(1920)
    expect(contract?.updatedAt).toBe(t2Iso)
  })

  test('a billable limit of 0 is rejected', async () => {
    const result = await service.save({ ...fields, billableLimit: 0 })

    expect(result).toEqual({ ok: false, error: 'limit-not-positive' })
    expect(await service.current()).toBeUndefined()
  })

  test('a billable limit of 0 is rejected when updating', async () => {
    await createContract()

    const result = await service.save({ ...fields, billableLimit: 0 })

    expect(result).toEqual({ ok: false, error: 'limit-not-positive' })
    expect((await service.current())?.billableLimit).toBe(2160)
  })

  test('expected hours are stored per period', async () => {
    const contract = await createContract()

    const result = await service.setExpected(contract, '2026-10-05', 2160)

    expect(result.ok).toBe(true)
    expect(await service.expectedFor(contract, '2026-10-05')).toBe(2160)
    expect(await service.expectedFor(contract, '2026-10-12')).toBeUndefined()
  })

  test('negative expected hours are rejected', async () => {
    const contract = await createContract()

    const result = await service.setExpected(contract, '2026-10-05', -240)

    expect(result).toEqual({ ok: false, error: 'negative' })
    expect(await service.expectedFor(contract, '2026-10-05')).toBeUndefined()
  })

  test('0 expected hours are allowed', async () => {
    const contract = await createContract()

    const result = await service.setExpected(contract, '2026-10-05', 0)

    expect(result.ok).toBe(true)
    expect(await service.expectedFor(contract, '2026-10-05')).toBe(0)
  })

  test('a period start that is not a Monday is rejected for a weekly cycle', async () => {
    const contract = await createContract()

    const result = await service.setExpected(contract, '2026-10-07', 2160)

    expect(result).toEqual({ ok: false, error: 'not-a-period-start' })
    expect(await expectedHours.all()).toHaveLength(0)
  })

  test('a period start that is not the first of the month is rejected for a monthly cycle', async () => {
    const result = await service.save({
      ...fields,
      startDate: '2026-10-01',
      billingCycle: 'month',
    })
    if (!result.ok) throw new Error(`save failed: ${result.error}`)

    const onMonday = await service.setExpected(result.value, '2026-10-05', 9000)
    const onFirst = await service.setExpected(result.value, '2026-10-01', 9000)

    expect(onMonday).toEqual({ ok: false, error: 'not-a-period-start' })
    expect(onFirst.ok).toBe(true)
  })

  test('clearing expected hours soft-deletes the record', async () => {
    const contract = await lockedContract()

    const result = await service.setExpected(contract, '2026-10-05', undefined)

    expect(result.ok).toBe(true)
    expect(await service.expectedFor(contract, '2026-10-05')).toBeUndefined()
    const stored = await expectedHours.all()
    expect(stored).toHaveLength(1)
    expect(stored[0].deleted).toBe(true)
  })

  test('setting expected hours again keeps one active record per period', async () => {
    const contract = await createContract()
    await service.setExpected(contract, '2026-10-05', 2160)

    const result = await service.setExpected(contract, '2026-10-05', 1920)

    expect(result.ok).toBe(true)
    expect(await service.expectedFor(contract, '2026-10-05')).toBe(1920)
    const active = (await expectedHours.all()).filter((r) => !r.deleted)
    expect(active).toHaveLength(1)
    expect(active[0]).toMatchObject({
      contractId: contract.id,
      periodStart: '2026-10-05',
      expected: 1920,
    })
  })

  test.each<[string, Partial<ContractFields>]>([
    ['billing cycle', { billingCycle: 'month' }],
    ['contract start', { startDate: '2026-10-12' }],
    ['billable limit', { billableLimit: 1920 }],
  ])('the %s is locked once expected hours exist', async (_field, changes) => {
    await lockedContract()

    const result = await service.save({ ...fields, ...changes })

    expect(result).toEqual({ ok: false, error: 'contract-locked' })
    expect(await service.current()).toMatchObject(fields)
  })

  test('the contract can change again once its only expected hours are cleared', async () => {
    const contract = await lockedContract()
    await service.setExpected(contract, '2026-10-05', undefined)

    const result = await service.save({ ...fields, billableLimit: 1920 })

    expect(result.ok).toBe(true)
    expect((await service.current())?.billableLimit).toBe(1920)
  })

  test('the starting balance can change while the contract is locked', async () => {
    await lockedContract()

    const result = await service.save({ ...fields, startingBalance: -120 })

    expect(result.ok).toBe(true)
    expect((await service.current())?.startingBalance).toBe(-120)
  })

  test('saving the same values while locked is not rejected', async () => {
    await lockedContract()

    const result = await service.save({ ...fields })

    expect(result.ok).toBe(true)
    expect(await service.current()).toMatchObject(fields)
  })
})
