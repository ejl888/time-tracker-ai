import { expect, test } from 'vitest'
import { Temporal } from 'temporal-polyfill'
import { workedInPeriod } from './balance.ts'
import { periodOf } from './contracts.ts'
import type { Entry, Label } from './records.ts'

const date = (text: string) => Temporal.PlainDate.from(text)

const base = {
  createdAt: '2026-01-01T12:00:00.000Z',
  updatedAt: '2026-01-01T12:00:00.000Z',
  deleted: false,
}

const project: Label = {
  ...base,
  id: 'project',
  name: 'Project',
  billable: true,
}
const lunch: Label = { ...base, id: 'lunch', name: 'Lunch', billable: false }
const labels = [project, lunch]

/** Monday 2026-10-05 up to and including Sunday 2026-10-11. */
const week = periodOf(date('2026-10-05'), 'week')

/** A contract that starts long before the periods in these tests. */
const contract = { startDate: '2026-01-01' }

let nextId = 1

/** A billable entry on the date from 09:00 local time in its time zone, with this many minutes. */
function entryOn(
  day: string,
  minutes: number,
  fields: Partial<Entry> = {},
): Entry {
  const timeZone = fields.timeZone ?? 'Europe/Amsterdam'
  const start = date(day)
    .toZonedDateTime({ timeZone, plainTime: '09:00' })
    .toInstant()
  return {
    ...base,
    id: `entry-${nextId++}`,
    start: start.toString({ smallestUnit: 'millisecond' }),
    end: start.add({ minutes }).toString({ smallestUnit: 'millisecond' }),
    timeZone,
    description: '',
    labelId: project.id,
    ...fields,
  }
}

test('without entries nothing is worked', () => {
  expect(workedInPeriod(contract, week, [], labels)).toEqual({
    billable: 0,
    nonBillable: 0,
  })
})

test('a week counts Monday to Sunday and not the days around it', () => {
  const entries = [
    entryOn('2026-10-04', 1),
    entryOn('2026-10-05', 10),
    entryOn('2026-10-11', 100),
    entryOn('2026-10-12', 1000),
  ]

  expect(workedInPeriod(contract, week, entries, labels)).toEqual({
    billable: 110,
    nonBillable: 0,
  })
})

test('billable and non-billable minutes are added up separately', () => {
  const entries = [
    entryOn('2026-10-05', 60),
    entryOn('2026-10-05', 30, { labelId: lunch.id }),
    entryOn('2026-10-06', 90),
    entryOn('2026-10-07', 15, { labelId: lunch.id }),
  ]

  expect(workedInPeriod(contract, week, entries, labels)).toEqual({
    billable: 150,
    nonBillable: 45,
  })
})

test('entries before the contract start do not count, those on the start day do', () => {
  const entries = [
    entryOn('2026-10-06', 1),
    entryOn('2026-10-06', 2, { labelId: lunch.id }),
    entryOn('2026-10-07', 10),
    entryOn('2026-10-07', 20, { labelId: lunch.id }),
    entryOn('2026-10-08', 100),
    entryOn('2026-10-08', 200, { labelId: lunch.id }),
  ]

  expect(
    workedInPeriod({ startDate: '2026-10-07' }, week, entries, labels),
  ).toEqual({ billable: 110, nonBillable: 220 })
})

test('deleted entries do not count', () => {
  const entries = [
    entryOn('2026-10-05', 60),
    entryOn('2026-10-05', 30, { deleted: true }),
    entryOn('2026-10-05', 15, { deleted: true, labelId: lunch.id }),
  ]

  expect(workedInPeriod(contract, week, entries, labels)).toEqual({
    billable: 60,
    nonBillable: 0,
  })
})

test('a deleted label still counts with its own billable setting', () => {
  const entries = [
    entryOn('2026-10-05', 60),
    entryOn('2026-10-05', 30, { labelId: lunch.id }),
  ]
  const deletedLabels = labels.map((label) => ({ ...label, deleted: true }))

  expect(workedInPeriod(contract, week, entries, deletedLabels)).toEqual({
    billable: 60,
    nonBillable: 30,
  })
})

test('an entry whose label is not found counts as non-billable', () => {
  const entries = [entryOn('2026-10-05', 60, { labelId: 'unknown' })]

  expect(workedInPeriod(contract, week, entries, labels)).toEqual({
    billable: 0,
    nonBillable: 60,
  })
})

test('a month counts its first to its last day and not the days around it', () => {
  const month = periodOf(date('2026-11-15'), 'month')
  const entries = [
    entryOn('2026-10-31', 1),
    entryOn('2026-11-01', 10),
    entryOn('2026-11-30', 100),
    entryOn('2026-12-01', 1000),
  ]

  expect(workedInPeriod(contract, month, entries, labels)).toEqual({
    billable: 110,
    nonBillable: 0,
  })
})

test('a week across a year end counts days in both years', () => {
  const yearEnd = periodOf(date('2026-12-31'), 'week')
  const entries = [
    entryOn('2026-12-27', 1),
    entryOn('2026-12-28', 10),
    entryOn('2026-12-31', 20),
    entryOn('2027-01-01', 30),
    entryOn('2027-01-03', 40),
    entryOn('2027-01-04', 1000),
  ]

  expect(workedInPeriod(contract, yearEnd, entries, labels)).toEqual({
    billable: 100,
    nonBillable: 0,
  })
})

test('an entry counts on its local date in its own time zone', () => {
  const entries = [
    // Sunday 22:00 to 23:00 in New York: Monday 12 October in UTC and Amsterdam.
    entryOn('2026-10-11', 60, {
      timeZone: 'America/New_York',
      start: '2026-10-12T02:00:00.000Z',
      end: '2026-10-12T03:00:00.000Z',
    }),
    // Sunday 4 October 22:00 to 22:30 in New York: Monday 5 October in UTC and Amsterdam.
    entryOn('2026-10-04', 30, {
      timeZone: 'America/New_York',
      start: '2026-10-05T02:00:00.000Z',
      end: '2026-10-05T02:30:00.000Z',
    }),
  ]

  expect(workedInPeriod(contract, week, entries, labels)).toEqual({
    billable: 60,
    nonBillable: 0,
  })
})

test('the contract start is compared with the local date of an entry', () => {
  // Tuesday 6 October 22:00 to 23:00 in New York: Wednesday 7 October in UTC and Amsterdam.
  const entry = entryOn('2026-10-06', 60, {
    timeZone: 'America/New_York',
    start: '2026-10-07T02:00:00.000Z',
    end: '2026-10-07T03:00:00.000Z',
  })

  expect(
    workedInPeriod({ startDate: '2026-10-07' }, week, [entry], labels),
  ).toEqual({ billable: 0, nonBillable: 0 })
  expect(
    workedInPeriod({ startDate: '2026-10-06' }, week, [entry], labels),
  ).toEqual({ billable: 60, nonBillable: 0 })
})
