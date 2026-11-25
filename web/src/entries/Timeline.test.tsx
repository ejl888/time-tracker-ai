import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Temporal } from 'temporal-polyfill'
import { expect, test } from 'vitest'
import { fixedClock } from '../domain/clock.ts'
import { createContractService } from '../domain/contracts.ts'
import { createEntryService } from '../domain/entries.ts'
import { createLabelService } from '../domain/labels.ts'
import type {
  Contract,
  Entry,
  ExpectedHours,
  Label,
} from '../domain/records.ts'
import { InMemoryRepository } from '../domain/repository.ts'
import { EntriesPage } from './EntriesPage.tsx'

// The timeline of a day on the Entries page (US-17): its entries as bars by clock time.

const timeZone = 'Europe/Amsterdam'

type LabelName = 'Client' | 'Admin'

interface SeedEntry {
  date: string
  start: string
  end: string
  /** The billable Client when left out; Admin is not billable. */
  label?: LabelName
}

interface Setup {
  entries?: SeedEntry[]
  /** The labels to delete after the entries are added. */
  deletedLabels?: LabelName[]
}

/** Renders the Entries page on in-memory services on Wed 18 Nov 2026 at noon, in the week from Mon 16 Nov. */
async function renderPage({
  entries: seedEntries = [],
  deletedLabels = [],
}: Setup = {}) {
  const clock = fixedClock(Temporal.Instant.from('2026-11-18T12:00+01:00'))
  const entryRepository = new InMemoryRepository<Entry>()
  const labels = createLabelService(
    new InMemoryRepository<Label>(),
    entryRepository,
    clock,
  )
  const entries = createEntryService(entryRepository, clock)
  const contracts = createContractService(
    new InMemoryRepository<Contract>(),
    new InMemoryRepository<ExpectedHours>(),
    clock,
  )
  const ids = new Map<LabelName, string>()
  for (const name of ['Client', 'Admin'] as const) {
    const created = await labels.create(name, { billable: name === 'Client' })
    if (!created.ok) throw new Error(`could not seed label ${name}`)
    ids.set(name, created.value.id)
  }
  for (const seed of seedEntries) {
    const added = await entries.add({
      date: Temporal.PlainDate.from(seed.date),
      start: Temporal.PlainTime.from(seed.start),
      end: Temporal.PlainTime.from(seed.end),
      labelId: ids.get(seed.label ?? 'Client')!,
      description: '',
      timeZone,
    })
    if (!added.ok) throw new Error(`could not seed entry: ${added.error}`)
  }
  for (const name of deletedLabels) {
    const removed = await labels.remove(ids.get(name)!)
    if (!removed.ok) throw new Error(`could not delete label ${name}`)
  }
  render(
    <EntriesPage
      entries={entries}
      labels={labels}
      contracts={contracts}
      clock={clock}
      timeZone={timeZone}
    />,
  )
  return { user: userEvent.setup() }
}

type User = ReturnType<typeof userEvent.setup>

const TUE = 'Tuesday 17 November'
const WED = 'Wednesday 18 November'

/** The section of a day, e.g. "Wednesday 18 November". */
function day(name: string) {
  return screen.getByRole('region', { name })
}

function findDay(name: string) {
  return screen.findByRole('region', { name })
}

/** The add row of an open day, once it is shown. */
async function findAddRow(name: string) {
  const form = await within(await findDay(name)).findByRole('form', {
    name: 'Add entry',
  })
  return within(form)
}

/** Fills in the add row of an open day and clicks "Add", without waiting for the result. */
async function addEntry(user: User, name: string, start: string, end: string) {
  const row = await findAddRow(name)
  for (const [field, text] of [
    ['Start', start],
    ['End', end],
  ]) {
    await user.clear(row.getByRole('textbox', { name: field }))
    await user.type(row.getByRole('textbox', { name: field }), text)
  }
  await user.selectOptions(
    row.getByRole('combobox', { name: 'Label' }),
    row.getByRole('option', { name: 'Client' }),
  )
  await user.click(row.getByRole('button', { name: 'Add' }))
}

/** The timeline of a day, if it has one. It is hidden from assistive technology, so it has no role. */
function timeline(name: string) {
  const found = day(name).querySelectorAll<HTMLElement>(
    'div.timeline[aria-hidden="true"]',
  )
  expect(found.length).toBeLessThanOrEqual(1)
  return found.length === 0 ? null : found[0]
}

/** The times below the timeline of a day, or null when there are none. */
function scale(name: string) {
  const found = day(name).querySelector('div.tl-scale.num[aria-hidden="true"]')
  return (
    found && Array.from(found.querySelectorAll('span'), (s) => s.textContent)
  )
}

interface Bar {
  /** Percentages of the timeline. */
  left: number
  width: number
  nonBillable: boolean
}

/** The bars in the timeline of a day, rounded to two decimals; none without a timeline. */
function bars(name: string): Bar[] {
  const spans = timeline(name)?.querySelectorAll<HTMLElement>('span') ?? []
  return Array.from(spans, (bar) => {
    expect(bar.style.left).toMatch(/%$/)
    expect(bar.style.width).toMatch(/%$/)
    return {
      left: Number(parseFloat(bar.style.left).toFixed(2)),
      width: Number(parseFloat(bar.style.width).toFixed(2)),
      nonBillable: bar.classList.contains('nb'),
    }
  })
}

const billable = (left: number, width: number): Bar => ({
  left,
  width,
  nonBillable: false,
})

const nonBillable = (left: number, width: number): Bar => ({
  left,
  width,
  nonBillable: true,
})

test('a collapsed day shows one bar per entry, without times', async () => {
  await renderPage({
    entries: [
      { date: '2026-11-17', start: '10:00', end: '13:00' },
      { date: '2026-11-17', start: '13:00', end: '14:30', label: 'Admin' },
    ],
  })

  await findDay(TUE)
  expect(bars(TUE)).toEqual([billable(25, 25), nonBillable(50, 12.5)])
  expect(scale(TUE)).toBeNull()
})

test('the open day shows one bar per entry, with the times below it', async () => {
  await renderPage({
    entries: [
      { date: '2026-11-18', start: '07:00', end: '10:00' },
      { date: '2026-11-18', start: '16:00', end: '19:00', label: 'Admin' },
    ],
  })

  await findDay(WED)
  expect(bars(WED)).toEqual([billable(0, 25), nonBillable(75, 25)])
  expect(scale(WED)).toEqual(['07:00', '19:00'])
})

test('days without entries show no timeline', async () => {
  await renderPage({
    entries: [{ date: '2026-11-16', start: '10:00', end: '13:00' }],
  })

  await findDay(WED)
  expect(timeline('Monday 16 November')).not.toBeNull()
  expect(timeline(TUE)).toBeNull()
  expect(timeline(WED)).toBeNull()
  expect(scale(WED)).toBeNull()
})

test('the timeline widens for entries before 07:00 and after 19:00', async () => {
  await renderPage({
    entries: [
      { date: '2026-11-18', start: '06:15', end: '07:00' },
      { date: '2026-11-18', start: '22:00', end: '00:00' },
    ],
  })

  await findDay(WED)
  expect(scale(WED)).toEqual(['06:15', '24:00'])
  // Of 17 hours and 45 minutes.
  expect(bars(WED)).toEqual([billable(0, 4.23), billable(88.73, 11.27)])
})

test('each day has its own span', async () => {
  await renderPage({
    entries: [
      { date: '2026-11-17', start: '10:00', end: '13:00' },
      { date: '2026-11-18', start: '19:00', end: '23:00' },
    ],
  })

  await findDay(WED)
  expect(scale(WED)).toEqual(['07:00', '23:00'])
  expect(bars(WED)).toEqual([billable(75, 25)])
  expect(bars(TUE)).toEqual([billable(25, 25)])
})

test('an entry keeps the kind of its label when the label is deleted', async () => {
  await renderPage({
    entries: [
      { date: '2026-11-17', start: '10:00', end: '13:00' },
      { date: '2026-11-17', start: '13:00', end: '16:00', label: 'Admin' },
    ],
    deletedLabels: ['Client', 'Admin'],
  })

  await findDay(TUE)
  expect(bars(TUE)).toEqual([billable(25, 25), nonBillable(50, 25)])
})

test('the times move along when another day is opened', async () => {
  const { user } = await renderPage({
    entries: [
      { date: '2026-11-17', start: '10:00', end: '13:00' },
      { date: '2026-11-18', start: '10:00', end: '13:00' },
    ],
  })
  await findDay(WED)
  expect(scale(WED)).toEqual(['07:00', '19:00'])

  await user.click(screen.getByRole('button', { name: `Open ${TUE}` }))

  await waitFor(() => expect(scale(TUE)).toEqual(['07:00', '19:00']))
  expect(bars(TUE)).toEqual([billable(25, 25)])
  expect(scale(WED)).toBeNull()
  expect(bars(WED)).toEqual([billable(25, 25)])
})

test('the timeline updates after adding an entry', async () => {
  const { user } = await renderPage()
  await addEntry(user, WED, '10:00', '11:30')
  await waitFor(() => expect(bars(WED)).toEqual([billable(25, 12.5)]))
  expect(scale(WED)).toEqual(['07:00', '19:00'])

  await addEntry(user, WED, '06:00', '07:00')

  await waitFor(() => expect(scale(WED)).toEqual(['06:00', '19:00']))
  // Of 13 hours.
  expect(bars(WED)).toEqual([billable(0, 7.69), billable(30.77, 11.54)])
})
