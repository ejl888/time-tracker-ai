import { Temporal } from 'temporal-polyfill'
import { expect, test } from 'vitest'
import { formatShortDateRange } from './dateText.ts'

test.each([
  ['2026-11-23', '2026-11-29', '23–29 Nov'],
  ['2026-12-28', '2027-01-03', '28 Dec – 3 Jan'],
  ['2026-11-30', '2026-12-06', '30 Nov – 6 Dec'],
])('shortens the days from %s to %s to "%s"', (start, end, text) => {
  const range = formatShortDateRange(
    Temporal.PlainDate.from(start),
    Temporal.PlainDate.from(end),
  )

  expect(range).toBe(text)
})
