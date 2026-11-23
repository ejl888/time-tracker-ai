import { expect, test } from 'vitest'
import { Temporal } from 'temporal-polyfill'
import { billedMinutes, periodOf } from './contracts.ts'

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
