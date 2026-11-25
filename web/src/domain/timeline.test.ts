import { describe, expect, test } from 'vitest'
import { Temporal } from 'temporal-polyfill'
import type { Entry, Label } from './records.ts'
import { timelineOf } from './timeline.ts'

const AMSTERDAM = 'Europe/Amsterdam'

const recordFields = {
  createdAt: '2026-11-18T08:00:00.000Z',
  updatedAt: '2026-11-18T08:00:00.000Z',
  deleted: false,
}

const client: Label = {
  ...recordFields,
  id: 'client',
  name: 'Client',
  billable: true,
}
const admin: Label = {
  ...recordFields,
  id: 'admin',
  name: 'Admin',
  billable: false,
}
const labels = [client, admin]

/** An entry between two instants, e.g. "2026-11-18T09:00+01:00". */
function entryAt(
  start: string,
  end: string,
  { labelId = client.id, timeZone = AMSTERDAM } = {},
): Entry {
  const instant = (text: string) =>
    Temporal.Instant.from(text).toString({ fractionalSecondDigits: 3 })
  return {
    ...recordFields,
    id: `${start}-${end}`,
    start: instant(start),
    end: instant(end),
    timeZone,
    description: '',
    labelId,
  }
}

/** An entry on Wed 18 Nov 2026 in Amsterdam; an end of 24:00 is the next midnight. */
function entry(start: string, end: string, labelId = client.id): Entry {
  return entryAt(
    `2026-11-18T${start}+01:00`,
    end === '24:00' ? '2026-11-19T00:00+01:00' : `2026-11-18T${end}+01:00`,
    { labelId },
  )
}

/** The minute of the day of a time, up to "24:00". */
function minute(time: string): number {
  const [hours, minutes] = time.split(':').map(Number)
  return hours * 60 + minutes
}

/** Checks the span and, per bar, its clock minutes: where it starts and how wide it is. */
function expectTimeline(
  entries: Entry[],
  from: string,
  to: string,
  bars: [start: string, minutes: number][],
) {
  const timeline = timelineOf(entries, labels)
  expect(timeline.from).toBe(minute(from))
  expect(timeline.to).toBe(minute(to))
  const span = minute(to) - minute(from)
  expect(timeline.bars).toHaveLength(bars.length)
  bars.forEach(([start, minutes], index) => {
    const bar = timeline.bars[index]
    expect(bar.start).toBeCloseTo((minute(start) - minute(from)) / span, 10)
    expect(bar.width).toBeCloseTo(minutes / span, 10)
  })
}

describe('the span', () => {
  test('runs from 07:00 to 19:00 without bars when there are no entries', () => {
    expect(timelineOf([], labels)).toEqual({ from: 420, to: 1140, bars: [] })
  })

  test('runs from 07:00 to 19:00 when all entries are within it', () => {
    expect(timelineOf([entry('10:00', '13:00')], labels)).toEqual({
      from: 420,
      to: 1140,
      bars: [{ start: 0.25, width: 0.25, billable: true }],
    })
  })

  test('does not widen for an entry from exactly 07:00 to 19:00', () => {
    expectTimeline([entry('07:00', '19:00')], '07:00', '19:00', [
      ['07:00', 12 * 60],
    ])
  })

  test('starts at the earliest start before 07:00', () => {
    expectTimeline(
      [entry('06:15', '06:45'), entry('06:30', '08:00')],
      '06:15',
      '19:00',
      [
        ['06:15', 30],
        ['06:30', 90],
      ],
    )
  })

  test('ends at the latest end after 19:00, also of an entry that starts earlier', () => {
    expectTimeline(
      [entry('18:00', '21:30'), entry('18:30', '20:00')],
      '07:00',
      '21:30',
      [
        ['18:00', 210],
        ['18:30', 90],
      ],
    )
  })

  test('ends at 24:00 for an entry that ends at midnight', () => {
    expectTimeline([entry('22:30', '24:00')], '07:00', '24:00', [['22:30', 90]])
  })

  test('covers a whole day from 00:00 to 24:00', () => {
    expect(timelineOf([entry('00:00', '24:00')], labels)).toEqual({
      from: 0,
      to: 1440,
      bars: [{ start: 0, width: 1, billable: true }],
    })
  })
})

describe('the bars', () => {
  test('follow the order of the entries, also when they overlap', () => {
    expectTimeline(
      [
        entry('09:00', '11:00'),
        entry('10:00', '10:30'),
        entry('11:00', '12:00'),
      ],
      '07:00',
      '19:00',
      [
        ['09:00', 120],
        ['10:00', 30],
        ['11:00', 60],
      ],
    )
  })

  test('are billable when their label is, deleted or not', () => {
    const all = [
      client,
      admin,
      { ...client, id: 'old-client', deleted: true },
      { ...admin, id: 'old-admin', deleted: true },
    ]
    const entries = all.map(({ id }) => entry('09:00', '10:00', id))

    expect(timelineOf(entries, all).bars.map((bar) => bar.billable)).toEqual([
      true,
      false,
      true,
      false,
    ])
  })

  test('are not billable when their label is unknown', () => {
    const { bars } = timelineOf([entry('09:00', '10:00', 'unknown')], labels)

    expect(bars.map((bar) => bar.billable)).toEqual([false])
  })

  test("use the clock of the entry's own time zone", () => {
    expectTimeline(
      [
        entryAt('2026-11-18T09:00-05:00', '2026-11-18T10:00-05:00', {
          timeZone: 'America/New_York',
        }),
        entryAt('2026-11-18T22:00+13:00', '2026-11-19T00:00+13:00', {
          timeZone: 'Pacific/Auckland',
        }),
      ],
      '07:00',
      '24:00',
      [
        ['09:00', 60],
        ['22:00', 120],
      ],
    )
  })
})

describe('on a day the clocks change', () => {
  test('a bar over the skipped hour is as wide as on the clock', () => {
    // One real hour.
    expectTimeline(
      [entryAt('2026-03-29T01:30+01:00', '2026-03-29T03:30+02:00')],
      '01:30',
      '19:00',
      [['01:30', 120]],
    )
  })

  test('a bar over the repeated hour is as wide as on the clock', () => {
    // Three real hours.
    expectTimeline(
      [entryAt('2026-10-25T01:30+02:00', '2026-10-25T03:30+01:00')],
      '01:30',
      '19:00',
      [['01:30', 120]],
    )
  })

  test.each([
    ['before', '02:15'],
    ['at', '02:30'],
  ])(
    'a bar whose end is %s its start on the clock has no width',
    (_position, end) => {
      expectTimeline(
        [entryAt('2026-10-25T02:30+02:00', `2026-10-25T${end}+01:00`)],
        '02:30',
        '19:00',
        [['02:30', 0]],
      )
    },
  )

  test('the span starts at the earliest clock time, also of a later entry', () => {
    expectTimeline(
      [
        entryAt('2026-10-25T02:30+02:00', '2026-10-25T02:45+02:00'),
        entryAt('2026-10-25T02:10+01:00', '2026-10-25T02:20+01:00'),
      ],
      '02:10',
      '19:00',
      [
        ['02:30', 15],
        ['02:10', 10],
      ],
    )
  })
})
