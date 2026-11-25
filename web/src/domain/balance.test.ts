import { describe, expect, test } from 'vitest'
import { Temporal } from 'temporal-polyfill'
import {
  balanceAfter,
  balanceBefore,
  hoursLeft,
  periodResult,
  workedInPeriod,
} from './balance.ts'
import { periodOf } from './contracts.ts'
import type { Entry, ExpectedHours, Label } from './records.ts'

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

/** Expected hours of the contract for the period that starts on the date. */
function expectedOn(
  periodStart: string,
  expected: number,
  fields: Partial<ExpectedHours> = {},
): ExpectedHours {
  return {
    ...base,
    id: `expected-${nextId++}`,
    contractId: 'contract',
    periodStart,
    expected,
    ...fields,
  }
}

describe('balanceBefore', () => {
  /** A contract from Monday 2026-10-05 with a limit of 36:00. */
  const weekly = {
    startDate: '2026-10-05',
    billableLimit: 2160,
    startingBalance: 0,
  }
  const secondWeek = periodOf(date('2026-10-12'), 'week')
  const thirdWeek = periodOf(date('2026-10-19'), 'week')

  test.each([0, 300, -300])(
    'without entries and expected hours it is the starting balance %i',
    (startingBalance) => {
      expect(
        balanceBefore(
          { ...weekly, startingBalance },
          thirdWeek,
          [],
          [],
          labels,
        ),
      ).toBe(startingBalance)
    },
  )

  test('adds the worked minutes and subtracts the billed minutes of earlier periods', () => {
    const expected = [
      expectedOn('2026-10-05', 600),
      expectedOn('2026-10-12', 500),
    ]
    const entries = [entryOn('2026-10-05', 480), entryOn('2026-10-18', 700)]

    expect(
      balanceBefore(
        { ...weekly, startingBalance: -30 },
        thirdWeek,
        expected,
        entries,
        labels,
      ),
    ).toBe(-30 + 480 + 700 - 600 - 500)
  })

  test('can be negative', () => {
    const expected = [expectedOn('2026-10-05', 600)]
    const entries = [entryOn('2026-10-06', 480)]

    expect(balanceBefore(weekly, secondWeek, expected, entries, labels)).toBe(
      -120,
    )
  })

  test('does not include the entries and expected hours of the period itself and later', () => {
    const expected = [
      expectedOn('2026-10-05', 100),
      expectedOn('2026-10-12', 7),
      expectedOn('2026-10-19', 9),
    ]
    const entries = [
      entryOn('2026-10-11', 160),
      entryOn('2026-10-12', 1),
      entryOn('2026-10-18', 2),
      entryOn('2026-10-19', 4),
    ]

    expect(balanceBefore(weekly, secondWeek, expected, entries, labels)).toBe(
      60,
    )
  })

  test('caps the expected hours of each period at the limit', () => {
    const expected = [
      expectedOn('2026-10-05', 2400),
      expectedOn('2026-10-12', 1800),
    ]

    expect(balanceBefore(weekly, thirdWeek, expected, [], labels)).toBe(
      -(2160 + 1800),
    )
  })

  test('skips deleted entries', () => {
    const entries = [
      entryOn('2026-10-05', 60),
      entryOn('2026-10-06', 30, { deleted: true }),
    ]

    expect(balanceBefore(weekly, secondWeek, [], entries, labels)).toBe(60)
  })

  test('skips deleted expected hours', () => {
    const expected = [
      expectedOn('2026-10-05', 600, { deleted: true }),
      expectedOn('2026-10-05', 100),
    ]

    expect(balanceBefore(weekly, secondWeek, expected, [], labels)).toBe(-100)
  })

  test('a deleted label still counts with its own billable setting', () => {
    const entries = [
      entryOn('2026-10-05', 60),
      entryOn('2026-10-05', 30, { labelId: lunch.id }),
    ]
    const deletedLabels = labels.map((label) => ({ ...label, deleted: true }))

    expect(balanceBefore(weekly, secondWeek, [], entries, deletedLabels)).toBe(
      60,
    )
  })

  test('non-billable entries do not count', () => {
    const entries = [
      entryOn('2026-10-05', 60),
      entryOn('2026-10-06', 30, { labelId: lunch.id }),
    ]

    expect(balanceBefore(weekly, secondWeek, [], entries, labels)).toBe(60)
  })

  test('entries before the contract start do not count, those on the start day do', () => {
    const entries = [
      entryOn('2026-09-28', 1),
      entryOn('2026-10-06', 2),
      entryOn('2026-10-07', 10),
      entryOn('2026-10-08', 100),
    ]

    expect(
      balanceBefore(
        { ...weekly, startDate: '2026-10-07' },
        secondWeek,
        [],
        entries,
        labels,
      ),
    ).toBe(110)
  })

  test('the expected hours of the week that holds a midweek start are billed', () => {
    const expected = [expectedOn('2026-10-05', 240)]
    const entries = [entryOn('2026-10-07', 480)]

    expect(
      balanceBefore(
        { ...weekly, startDate: '2026-10-07' },
        secondWeek,
        expected,
        entries,
        labels,
      ),
    ).toBe(240)
  })

  test('a period without expected hours bills nothing', () => {
    const expected = [expectedOn('2026-10-05', 600)]
    const entries = [entryOn('2026-10-05', 600), entryOn('2026-10-12', 480)]

    expect(balanceBefore(weekly, thirdWeek, expected, entries, labels)).toBe(
      480,
    )
  })

  test('the first period starts with the starting balance, also with a midweek start', () => {
    const expected = [expectedOn('2026-10-05', 600)]
    const entries = [
      entryOn('2026-10-04', 1),
      entryOn('2026-10-06', 2),
      entryOn('2026-10-07', 4),
    ]

    for (const startDate of ['2026-10-05', '2026-10-07']) {
      expect(
        balanceBefore(
          { ...weekly, startDate, startingBalance: 90 },
          week,
          expected,
          entries,
          labels,
        ),
      ).toBe(90)
    }
  })

  test('carries weeks over across a year end', () => {
    const yearEnd = { ...weekly, startDate: '2026-12-21' }
    const expected = [
      expectedOn('2026-12-21', 100),
      expectedOn('2026-12-28', 200),
      expectedOn('2027-01-04', 400),
    ]
    const entries = [
      entryOn('2026-12-27', 110),
      entryOn('2026-12-31', 120),
      entryOn('2027-01-03', 130),
      entryOn('2027-01-04', 1000),
    ]
    const before = (day: string) =>
      balanceBefore(
        yearEnd,
        periodOf(date(day), 'week'),
        expected,
        entries,
        labels,
      )

    expect(before('2027-01-01')).toBe(10)
    expect(before('2027-01-04')).toBe(60)
    expect(before('2027-01-11')).toBe(660)
  })

  test('carries months over', () => {
    const monthly = {
      startDate: '2026-10-15',
      billableLimit: 9000,
      startingBalance: 0,
    }
    const expected = [
      expectedOn('2026-10-01', 9600),
      expectedOn('2026-11-01', 300),
      expectedOn('2026-12-01', 1),
    ]
    const entries = [
      entryOn('2026-10-14', 1000),
      entryOn('2026-10-15', 100),
      entryOn('2026-10-31', 200),
      entryOn('2026-11-30', 400),
      entryOn('2026-12-01', 1000),
    ]
    const before = (day: string) =>
      balanceBefore(
        monthly,
        periodOf(date(day), 'month'),
        expected,
        entries,
        labels,
      )

    expect(before('2026-10-20')).toBe(0)
    expect(before('2026-11-20')).toBe(300 - 9000)
    expect(before('2026-12-20')).toBe(300 - 9000 + 100)
  })
})

test.each([
  [0, 2640, 2160, 480],
  [480, 1920, 2160, 240],
  [240, 1800, 2160, -120],
  [-120, 2280, 2160, 0],
  [60, 0, 0, 60],
])(
  'the balance after %i carried in, %i worked and %i billed is %i',
  (before, worked, billed, after) => {
    expect(balanceAfter(before, worked, billed)).toBe(after)
  },
)

test.each([
  [2160, 1200, 960],
  [960, 1200, -240],
  [1200, 1200, 0],
])('with %i billed and %i worked, %i is left', (billed, worked, left) => {
  expect(hoursLeft(billed, worked)).toBe(left)
})

test('a period bills up to the limit, and left and balance follow from that', () => {
  expect(periodResult(36 * 60, 40 * 60, -60, 38 * 60)).toEqual({
    billed: 36 * 60,
    left: -2 * 60,
    balanceAfter: 60,
  })
})

test('a period without expected hours bills nothing', () => {
  expect(periodResult(36 * 60, undefined, 60, 8 * 60)).toEqual({
    billed: 0,
    left: -8 * 60,
    balanceAfter: 9 * 60,
  })
})
