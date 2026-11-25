import { describe, expect, test } from 'vitest'
import { Temporal } from 'temporal-polyfill'
import { periodOf } from './contracts.ts'
import type { BillingCycle, Period } from './contracts.ts'
import {
  canGoBack,
  canGoForward,
  daysShown,
  firstPeriod,
  openDay,
  overviewCycle,
  shiftPeriod,
} from './overview.ts'

const date = (text: string) => Temporal.PlainDate.from(text)

/** The week that contains the date. */
const weekOf = (text: string) => periodOf(date(text), 'week')

/** The month that contains the date. */
const monthOf = (text: string) => periodOf(date(text), 'month')

/** A period as text, to compare. */
const describePeriod = (period: Period) => ({
  start: period.start.toString(),
  end: period.end.toString(),
  week: period.week,
})

/** The days shown as text. */
const shown = (period: Period, today: string) =>
  daysShown(period, date(today)).map(String)

const contractFrom = (startDate: string, billingCycle: BillingCycle) => ({
  startDate,
  billingCycle,
})

describe('daysShown', () => {
  test('the current week runs from today back to Monday', () => {
    expect(shown(weekOf('2026-11-25'), '2026-11-25')).toEqual([
      '2026-11-25',
      '2026-11-24',
      '2026-11-23',
    ])
  })

  test('only Monday is shown on a Monday', () => {
    expect(shown(weekOf('2026-11-23'), '2026-11-23')).toEqual(['2026-11-23'])
  })

  test('the whole week is shown on its Sunday', () => {
    const days = shown(weekOf('2026-11-29'), '2026-11-29')

    expect(days).toHaveLength(7)
    expect(days.at(0)).toBe('2026-11-29')
    expect(days.at(-1)).toBe('2026-11-23')
  })

  test('a past week over the year end shows all seven days', () => {
    expect(shown(weekOf('2026-12-31'), '2027-01-06')).toEqual([
      '2027-01-03',
      '2027-01-02',
      '2027-01-01',
      '2026-12-31',
      '2026-12-30',
      '2026-12-29',
      '2026-12-28',
    ])
  })

  test('the current week over the year end stops at today', () => {
    expect(shown(weekOf('2027-01-01'), '2027-01-01')).toEqual([
      '2027-01-01',
      '2026-12-31',
      '2026-12-30',
      '2026-12-29',
      '2026-12-28',
    ])
  })

  test('the current month runs from today back to the first', () => {
    const days = shown(monthOf('2026-11-25'), '2026-11-25')

    expect(days).toHaveLength(25)
    expect(days.at(0)).toBe('2026-11-25')
    expect(days.at(-1)).toBe('2026-11-01')
  })

  test.each([
    ['2026-10-01', 31, '2026-10-31'],
    ['2026-09-01', 30, '2026-09-30'],
    ['2026-02-01', 28, '2026-02-28'],
    ['2024-02-01', 29, '2024-02-29'],
    ['2025-12-01', 31, '2025-12-31'],
  ])('the past month from %s shows %i days, to %s', (first, count, last) => {
    const days = shown(monthOf(first), '2026-11-25')

    expect(days).toHaveLength(count)
    expect(days.at(0)).toBe(last)
    expect(days.at(-1)).toBe(first)
    expect(new Set(days).size).toBe(count)
  })

  test('the day a clock change happens is shown once', () => {
    expect(shown(weekOf('2026-10-25'), '2026-11-25')).toEqual([
      '2026-10-25',
      '2026-10-24',
      '2026-10-23',
      '2026-10-22',
      '2026-10-21',
      '2026-10-20',
      '2026-10-19',
    ])
  })
})

describe('openDay', () => {
  test.each([
    ['a workday', '2026-11-25'],
    ['Monday', '2026-11-23'],
    ['Saturday', '2026-11-28'],
    ['Sunday', '2026-11-29'],
  ])('today is open in its own week on %s', (_name, today) => {
    expect(openDay(weekOf(today), date(today)).toString()).toBe(today)
  })

  test.each(['2026-11-01', '2026-10-31', '2026-11-25'])(
    'today is open in its own month on %s',
    (today) => {
      expect(openDay(monthOf(today), date(today)).toString()).toBe(today)
    },
  )

  test('a past week opens on Friday', () => {
    expect(openDay(weekOf('2026-11-18'), date('2026-11-25')).toString()).toBe(
      '2026-11-20',
    )
  })

  test('a past week opens on Friday when today is the Monday after it', () => {
    expect(openDay(weekOf('2026-11-22'), date('2026-11-23')).toString()).toBe(
      '2026-11-20',
    )
  })

  test('a past week over the year end opens on its Friday', () => {
    expect(openDay(weekOf('2026-12-31'), date('2027-01-06')).toString()).toBe(
      '2027-01-01',
    )
  })

  test.each([
    ['a Saturday', '2026-10-01', '2026-10-30'],
    ['a Sunday', '2026-05-01', '2026-05-29'],
    ['a Monday', '2026-08-01', '2026-08-31'],
    ['a Wednesday', '2026-09-01', '2026-09-30'],
    ['a Friday', '2026-07-01', '2026-07-31'],
  ])('a past month that ends on %s opens on its last workday', (...args) => {
    const [, month, expected] = args

    expect(openDay(monthOf(month), date('2026-11-25')).toString()).toBe(
      expected,
    )
  })
})

describe('shiftPeriod', () => {
  test.each([
    ['2026-11-25', -1, '2026-11-16', '2026-11-22', 47],
    ['2026-11-25', 1, '2026-11-30', '2026-12-06', 49],
    ['2026-11-25', 0, '2026-11-23', '2026-11-29', 48],
    ['2026-11-25', -3, '2026-11-02', '2026-11-08', 45],
    ['2026-12-31', 1, '2027-01-04', '2027-01-10', 1],
    ['2027-01-04', -1, '2026-12-28', '2027-01-03', 53],
    ['2025-12-24', 1, '2025-12-29', '2026-01-04', 1],
    ['2026-01-01', -1, '2025-12-22', '2025-12-28', 52],
  ])('the week of %s shifted by %i is %s to %s, week %i', (...args) => {
    const [day, n, start, end, week] = args

    expect(describePeriod(shiftPeriod(weekOf(day), 'week', n))).toEqual({
      start,
      end,
      week,
    })
  })

  test.each([
    ['2026-11-25', -1, '2026-10-01', '2026-10-31'],
    ['2026-11-25', 0, '2026-11-01', '2026-11-30'],
    ['2026-01-31', 1, '2026-02-01', '2026-02-28'],
    ['2028-03-31', -1, '2028-02-01', '2028-02-29'],
    ['2026-02-28', 1, '2026-03-01', '2026-03-31'],
    ['2026-12-31', 1, '2027-01-01', '2027-01-31'],
    ['2027-01-31', -1, '2026-12-01', '2026-12-31'],
    ['2026-11-25', -12, '2025-11-01', '2025-11-30'],
  ])('the month of %s shifted by %i is %s to %s', (day, n, start, end) => {
    expect(describePeriod(shiftPeriod(monthOf(day), 'month', n))).toEqual({
      start,
      end,
      week: undefined,
    })
  })
})

describe('overviewCycle', () => {
  test('is the billing cycle of the contract', () => {
    expect(overviewCycle({ billingCycle: 'month' })).toBe('month')
    expect(overviewCycle({ billingCycle: 'week' })).toBe('week')
  })

  test('is a week without a contract', () => {
    expect(overviewCycle(undefined)).toBe('week')
  })
})

describe('firstPeriod', () => {
  const today = date('2026-11-25')
  const contract = contractFrom('2026-10-07', 'week')

  /** The first day of the first period. */
  const firstStart = (
    given: ReturnType<typeof contractFrom> | undefined,
    earliest: string | undefined,
  ) =>
    firstPeriod(
      given,
      earliest === undefined ? undefined : date(earliest),
      today,
    ).start.toString()

  test('is the current week without a contract or entries', () => {
    expect(describePeriod(firstPeriod(undefined, undefined, today))).toEqual(
      describePeriod(weekOf('2026-11-25')),
    )
  })

  test('holds the contract start without entries', () => {
    expect(describePeriod(firstPeriod(contract, undefined, today))).toEqual(
      describePeriod(weekOf('2026-10-07')),
    )
  })

  test('is the week of the earliest entry without a contract', () => {
    const first = firstPeriod(undefined, date('2025-12-31'), today)

    expect(describePeriod(first)).toEqual(describePeriod(weekOf('2025-12-31')))
  })

  test('holds the earliest entry when that is before the contract start', () => {
    expect(firstStart(contract, '2026-09-10')).toBe('2026-09-07')
  })

  test('holds the contract start when that is before the earliest entry', () => {
    expect(firstStart(contract, '2026-11-10')).toBe('2026-10-05')
  })

  test('is the period of both when the earliest entry is in the period of the contract start', () => {
    expect(firstStart(contract, '2026-10-05')).toBe('2026-10-05')
    expect(firstStart(contract, '2026-10-11')).toBe('2026-10-05')
  })

  test('is the period before when the earliest entry is on its last day', () => {
    expect(firstStart(contract, '2026-10-04')).toBe('2026-09-28')
  })

  test('is the current period when the contract starts or the entry falls in it', () => {
    expect(firstStart(contractFrom('2026-11-29', 'week'), undefined)).toBe(
      '2026-11-23',
    )
    expect(firstStart(undefined, '2026-11-24')).toBe('2026-11-23')
  })

  test('is the current period with a contract in the future and no entries', () => {
    expect(firstStart(contractFrom('2026-12-07', 'week'), undefined)).toBe(
      '2026-11-23',
    )
  })

  test('holds the earliest entry with a contract in the future', () => {
    expect(firstStart(contractFrom('2026-12-07', 'week'), '2026-11-10')).toBe(
      '2026-11-09',
    )
  })

  test('is the current period when the only entry is later, in another time zone', () => {
    const first = firstPeriod(undefined, date('2026-11-30'), date('2026-11-29'))

    expect(first.start.toString()).toBe('2026-11-23')
  })

  test('is a month with a monthly contract', () => {
    const monthly = contractFrom('2026-09-15', 'month')

    expect(describePeriod(firstPeriod(monthly, undefined, today))).toEqual(
      describePeriod(monthOf('2026-09-15')),
    )
    expect(firstStart(monthly, '2026-02-28')).toBe('2026-02-01')
    expect(firstStart(monthly, '2026-09-01')).toBe('2026-09-01')
    expect(firstStart(contractFrom('2027-01-01', 'month'), undefined)).toBe(
      '2026-11-01',
    )
  })
})

describe('canGoBack', () => {
  test.each([
    ['after', '2026-11-09', true],
    ['equal to', '2026-11-02', false],
    ['before', '2026-10-26', false],
  ])('for a week %s the first one', (_name, week, expected) => {
    expect(canGoBack(weekOf(week), weekOf('2026-11-04'))).toBe(expected)
  })

  test.each([
    ['after', '2027-01-01', true],
    ['equal to', '2026-12-01', false],
    ['before', '2026-11-01', false],
  ])('for a month %s the first one', (_name, month, expected) => {
    expect(canGoBack(monthOf(month), monthOf('2026-12-15'))).toBe(expected)
  })
})

describe('canGoForward', () => {
  test.each([
    ['a past week', '2026-11-22', '2026-11-25', true],
    ['the week before, on Monday', '2026-11-22', '2026-11-23', true],
    ['the current week, on Monday', '2026-11-23', '2026-11-23', false],
    ['the current week, on Sunday', '2026-11-23', '2026-11-29', false],
    ['a later week', '2026-11-30', '2026-11-29', false],
  ])('%s', (_name, week, today, expected) => {
    expect(canGoForward(weekOf(week), date(today))).toBe(expected)
  })

  test.each([
    ['the month before, on the first', '2026-12-01', '2027-01-01', true],
    ['the current month, on its first', '2026-12-01', '2026-12-01', false],
    ['the current month, on its last', '2026-12-01', '2026-12-31', false],
    ['a later month', '2027-01-01', '2026-12-31', false],
  ])('%s', (_name, month, today, expected) => {
    expect(canGoForward(monthOf(month), date(today))).toBe(expected)
  })
})
