import { beforeEach, expect, test } from 'vitest'
import { Temporal } from 'temporal-polyfill'
import type { Clock } from './clock.ts'
import {
  createEntryService,
  dateOf,
  durationOf,
  overlapping,
  prefillFor,
} from './entries.ts'
import type { NewEntry } from './entries.ts'
import type { Entry } from './records.ts'
import { InMemoryRepository } from './repository.ts'

const t1 = Temporal.Instant.from('2026-11-18T20:00:00Z')
const t2 = Temporal.Instant.from('2026-11-18T21:00:00Z')
const t1Iso = '2026-11-18T20:00:00.000Z'

const date = Temporal.PlainDate.from('2026-11-18')
const time = (text: string) => Temporal.PlainTime.from(text)

let current: Temporal.Instant
let entries: InMemoryRepository<Entry>
let service: ReturnType<typeof createEntryService>

beforeEach(() => {
  current = t1
  const clock: Clock = { now: () => current }
  entries = new InMemoryRepository<Entry>()
  service = createEntryService(entries, clock)
})

/** Adds an entry on `date` with these fields, then moves the clock on. */
async function added(fields: Partial<NewEntry> = {}): Promise<Entry> {
  const result = await service.add({
    date,
    start: time('09:00'),
    end: time('10:00'),
    labelId: 'label-1',
    description: 'Work',
    timeZone: 'Europe/Amsterdam',
    ...fields,
  })
  if (!result.ok) throw new Error(`add failed: ${result.error}`)
  current = t2
  return result.value
}

test('an edited entry keeps its own time zone and date', async () => {
  const entry = await added({ timeZone: 'America/New_York' })

  const result = await service.update(entry.id, { end: time('11:15') })

  expect(result.ok).toBe(true)
  if (!result.ok) return
  expect(result.value.timeZone).toBe('America/New_York')
  expect(dateOf(result.value).equals(date)).toBe(true)
  expect(durationOf(result.value)).toBe(135)
})

test('an end before the start is rejected and the entry is unchanged', async () => {
  const entry = await added()

  const result = await service.update(entry.id, { end: time('08:30') })

  expect(result).toEqual({ ok: false, error: 'end-not-after-start' })
  expect(await entries.get(entry.id)).toEqual(entry)
})

test('an empty label is rejected and the entry is unchanged', async () => {
  const entry = await added()

  const result = await service.update(entry.id, { labelId: '' })

  expect(result).toEqual({ ok: false, error: 'no-label' })
  expect(await entries.get(entry.id)).toEqual(entry)
})

test('an end of 00:00 is midnight at the end of the day', async () => {
  const entry = await added({ start: time('22:00'), end: time('23:00') })

  const result = await service.update(entry.id, { end: time('00:00') })

  expect(result.ok).toBe(true)
  if (!result.ok) return
  expect(durationOf(result.value)).toBe(120)
})

test('an update that changes nothing is not saved', async () => {
  const entry = await added()

  const result = await service.update(entry.id, { end: time('10:00') })

  expect(result.ok).toBe(true)
  expect((await entries.get(entry.id))?.updatedAt).toBe(t1Iso)
})

test('an unknown entry is not found', async () => {
  const result = await service.update(crypto.randomUUID(), {
    end: time('11:00'),
  })

  expect(result).toEqual({ ok: false, error: 'not-found' })
})

test('a deleted entry is not found', async () => {
  const entry = await added()
  await service.remove(entry.id)

  const result = await service.update(entry.id, { end: time('11:00') })

  expect(result).toEqual({ ok: false, error: 'not-found' })
})

test('a prefill from the latest end of the same day comes from the previous entry', async () => {
  await added()

  const prefill = prefillFor(date, await entries.all())

  expect(prefill?.source.kind).toBe('previous')
})

test('a prefill from the same weekday a week earlier is the same as that date', async () => {
  await added({ date: date.subtract({ days: 7 }) })
  await added({ date: date.subtract({ days: 1 }), start: time('08:00') })

  const prefill = prefillFor(date, await entries.all())

  expect(prefill?.source.kind).toBe('same-as')
  if (prefill?.source.kind !== 'same-as') return
  expect(prefill.source.date.toString()).toBe('2026-11-11')
})

test('a prefill from the most recent earlier day is the same as that date', async () => {
  await added({ date: date.subtract({ days: 3 }), start: time('08:00') })
  await added({ date: date.subtract({ days: 2 }) })

  const prefill = prefillFor(date, await entries.all())

  expect(prefill?.source.kind).toBe('same-as')
  if (prefill?.source.kind !== 'same-as') return
  expect(prefill.source.date.toString()).toBe('2026-11-16')
})

test('a prefill without earlier entries is the default start', async () => {
  const prefill = prefillFor(date, await entries.all())

  expect(prefill?.source.kind).toBe('default')
})

/** A candidate time range on `date` in Amsterdam. */
function candidate(start: string, end: string, id?: string) {
  return {
    date,
    start: time(start),
    end: time(end),
    timeZone: 'Europe/Amsterdam',
    id,
  }
}

test('a candidate overlapping entries returns them sorted by start', async () => {
  const later = await added({ start: time('11:00'), end: time('12:00') })
  const earlier = await added({ start: time('10:00'), end: time('11:00') })
  await added({
    date: date.subtract({ days: 1 }),
    start: time('10:30'),
    end: time('11:30'),
  })

  const result = overlapping(candidate('10:30', '11:30'), await entries.all())

  expect(result.map((entry) => entry.id)).toEqual([earlier.id, later.id])
})

test('an adjacent entry does not overlap', async () => {
  await added({ start: time('10:00'), end: time('11:00') })

  const result = overlapping(candidate('11:00', '12:00'), await entries.all())

  expect(result).toEqual([])
})

test('an edited entry does not overlap itself', async () => {
  const entry = await added({ start: time('10:00'), end: time('11:00') })

  const result = overlapping(
    candidate('10:00', '11:30', entry.id),
    await entries.all(),
  )

  expect(result).toEqual([])
})

test('a deleted entry does not overlap', async () => {
  const entry = await added({ start: time('10:00'), end: time('11:00') })
  await service.remove(entry.id)

  const result = overlapping(candidate('10:30', '11:30'), await entries.all())

  expect(result).toEqual([])
})

test('a candidate ending at midnight overlaps an entry ending at midnight', async () => {
  const entry = await added({ start: time('23:00'), end: time('00:00') })

  const result = overlapping(candidate('22:30', '00:00'), await entries.all())

  expect(result.map((e) => e.id)).toEqual([entry.id])
})
