import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Temporal } from 'temporal-polyfill'
import { expect, test, vi } from 'vitest'
import { fixedClock } from '../domain/clock.ts'
import {
  type ContractFields,
  createContractService,
} from '../domain/contracts.ts'
import { createEntryService } from '../domain/entries.ts'
import type { EntryService } from '../domain/entries.ts'
import { createLabelService } from '../domain/labels.ts'
import type {
  Contract,
  Entry,
  ExpectedHours,
  Label,
} from '../domain/records.ts'
import { InMemoryRepository } from '../domain/repository.ts'
import { EntriesPage } from './EntriesPage.tsx'

// The days of the period on the Entries page (US-07, US-17): one open, the others one line.

const timeZone = 'Europe/Amsterdam'

const weekly: ContractFields = {
  startDate: '2026-11-02',
  billingCycle: 'week',
  billableLimit: 36 * 60,
  startingBalance: 0,
}

const monthly: ContractFields = {
  startDate: '2026-01-01',
  billingCycle: 'month',
  billableLimit: 150 * 60,
  startingBalance: 0,
}

type LabelName = 'Client' | 'Admin'

interface SeedEntry {
  date: string
  start: string
  end: string
  /** The billable Client when left out; Admin is not billable. */
  label?: LabelName
  description?: string
  /** Europe/Amsterdam when left out. */
  timeZone?: string
}

interface Setup {
  /** Today in Amsterdam. Wed 18 Nov 2026 by default, in the week from Mon 16 Nov. */
  today?: string
  contract?: ContractFields
  entries?: SeedEntry[]
  /** The labels to delete after the entries are added. */
  deletedLabels?: LabelName[]
  /** Runs on the entry service after seeding, before the page renders. */
  prepare?: (entries: EntryService) => void
}

/** Renders the Entries page on in-memory services, today at noon in Amsterdam. */
async function renderPage({
  today = '2026-11-18',
  contract,
  entries: seedEntries = [],
  deletedLabels = [],
  prepare,
}: Setup = {}) {
  const clock = fixedClock(
    Temporal.PlainDate.from(today)
      .toZonedDateTime({ timeZone, plainTime: '12:00' })
      .toInstant(),
  )
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
      description: seed.description ?? '',
      timeZone: seed.timeZone ?? timeZone,
    })
    if (!added.ok) throw new Error(`could not seed entry: ${added.error}`)
  }
  for (const name of deletedLabels) {
    const removed = await labels.remove(ids.get(name)!)
    if (!removed.ok) throw new Error(`could not delete label ${name}`)
  }
  if (contract) {
    const saved = await contracts.save(contract)
    if (!saved.ok) throw new Error(`could not seed contract: ${saved.error}`)
  }
  prepare?.(entries)
  render(
    <EntriesPage
      entries={entries}
      labels={labels}
      contracts={contracts}
      clock={clock}
      timeZone={timeZone}
    />,
  )
  return { user: userEvent.setup(), entries }
}

type User = ReturnType<typeof userEvent.setup>

const MON = 'Monday 16 November'
const TUE = 'Tuesday 17 November'
const WED = 'Wednesday 18 November'

/** The section of a day, e.g. "Wednesday 18 November". */
function day(name: string) {
  return screen.getByRole('region', { name })
}

function findDay(name: string) {
  return screen.findByRole('region', { name })
}

/** The sections of all days shown, from top to bottom. */
function allDays() {
  return screen.queryAllByRole('region', { name: /^\w+day \d+ \w+$/ })
}

/** Waits until exactly these days are shown, from top to bottom. */
async function waitForDays(names: string[]) {
  await waitFor(() => {
    const days = allDays()
    expect(days).toEqual(names.map((name) => day(name)))
  })
}

/** Waits until this day is the only open one; all others are collapsed. */
async function waitForOpen(name: string) {
  await waitFor(() => {
    expect(day(name)).toHaveClass('day', 'active')
    expect(day(name)).not.toHaveClass('collapsed')
    for (const other of allDays()) {
      if (other === day(name)) continue
      expect(other).toHaveClass('day', 'collapsed')
      expect(other).not.toHaveClass('active')
    }
  })
}

/** Waits until a day is collapsed to a line with this text. */
async function waitForLine(name: string, text: string) {
  await waitFor(() => {
    expect(day(name)).toHaveClass('collapsed')
    expect(within(day(name)).getByText(text)).toBeInTheDocument()
  })
}

/** Opens a collapsed day with its button. */
async function open(user: User, name: string) {
  await user.click(await screen.findByRole('button', { name: `Open ${name}` }))
  await waitForOpen(name)
}

/** Clicks an arrow button of the period bar once it is enabled. */
async function clickArrow(user: User, name: string) {
  const button = await screen.findByRole('button', { name })
  await waitFor(() => expect(button).toBeEnabled())
  await user.click(button)
}

/** The add row of an open day, once it is shown. */
async function findAddRow(name: string) {
  const form = await within(await findDay(name)).findByRole('form', {
    name: 'Add entry',
  })
  return within(form)
}

/** Waits until a field of the add row of an open day has focus. */
async function waitForFocus(name: string, field: 'Start' | 'End') {
  await waitFor(() => {
    const form = within(day(name)).getByRole('form', { name: 'Add entry' })
    expect(within(form).getByRole('textbox', { name: field })).toHaveFocus()
  })
}

/** Waits until the add row of an open day shows these times. */
async function waitForAddTimes(name: string, start: string, end: string) {
  const row = await findAddRow(name)
  await waitFor(() => {
    expect(row.getByRole('textbox', { name: 'Start' })).toHaveValue(start)
    expect(row.getByRole('textbox', { name: 'End' })).toHaveValue(end)
  })
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

/** Opens the editor of the entry that starts at this time on an open day. */
async function openEntry(user: User, name: string, start: string) {
  const section = within(day(name))
  await user.click(
    await section.findByRole('button', { name: new RegExp(`^${start}–`) }),
  )
  return within(await section.findByRole('form', { name: 'Edit entry' }))
}

/** Waits until the summary shows these worked hours. */
async function waitForWorked(text: string) {
  await waitFor(() => {
    const summary = within(
      screen.getByRole('region', { name: 'Period summary' }),
    )
    const label = summary.getByText('Worked', { selector: 'span.k' })
    expect(label.closest('.metric')?.querySelector('span.v')).toHaveTextContent(
      text,
    )
  })
}

/** A promise to wait for, and a function that resolves it and lets the steps after it run. */
function releasable() {
  let resolve!: () => void
  const released = new Promise<void>((done) => {
    resolve = done
  })
  const release = () =>
    act(async () => {
      resolve()
      await new Promise((done) => setTimeout(done, 20))
    })
  return { released, release }
}

/**
 * Makes the loads of `entries.between` controllable. While `holding` is true, a load reads its
 * entries at once but only resolves after `release`.
 */
function holdableLoads() {
  const { released, release } = releasable()
  const loads = {
    holding: false,
    /** How many loads were held. */
    held: 0,
    release,
    prepare(entries: EntryService) {
      const load = entries.between
      vi.spyOn(entries, 'between').mockImplementation(async (start, end) => {
        const hold = loads.holding
        if (hold) loads.held += 1
        const loaded = await load(start, end)
        if (hold) await released
        return loaded
      })
    },
  }
  return loads
}

/** Holds the prefill of one date until `release`. */
function heldPrefill(date: string) {
  const { released, release } = releasable()
  return {
    release,
    prepare(entries: EntryService) {
      const load = entries.prefill
      vi.spyOn(entries, 'prefill').mockImplementation(async (of) => {
        const prefill = await load(of)
        if (of.toString() === date) await released
        return prefill
      })
    },
  }
}

/** Watches whether another number of days than now is ever shown, until the returned function is called. */
function watchForGaps() {
  const count = () => document.querySelectorAll('section.day').length
  const expected = count()
  let gap = false
  const observer = new MutationObserver(() => {
    if (count() !== expected) gap = true
  })
  observer.observe(document.body, { childList: true, subtree: true })
  return () => {
    observer.disconnect()
    return gap
  }
}

/** The names of the days of a November week, newest first. */
function november(...days: [weekday: string, day: number][]): string[] {
  return days.map(([weekday, date]) => `${weekday} ${date} November`)
}

// The days shown

test('shows the days of the week up to today without a contract, newest first, with today open', async () => {
  await renderPage()

  await waitForDays([WED, TUE, MON])
  await waitForOpen(WED)
})

test('shows the days of the week up to today with a weekly contract', async () => {
  await renderPage({ contract: weekly })

  await waitForDays([WED, TUE, MON])
  await waitForOpen(WED)
})

test('shows also the empty weekend days', async () => {
  await renderPage({ today: '2026-11-22' })

  await waitForDays(
    november(
      ['Sunday', 22],
      ['Saturday', 21],
      ['Friday', 20],
      ['Thursday', 19],
      ['Wednesday', 18],
      ['Tuesday', 17],
      ['Monday', 16],
    ),
  )
})

test('shows the days of the month up to today with a monthly contract', async () => {
  await renderPage({
    contract: monthly,
    entries: [{ date: '2026-11-02', start: '09:00', end: '10:30' }],
  })

  await waitFor(() => expect(allDays()).toHaveLength(18))
  expect(allDays()[0]).toBe(day(WED))
  expect(allDays()[17]).toBe(day('Sunday 1 November'))
  await waitForLine('Monday 2 November', '1:30 worked · 1 entry')
  await waitForOpen(WED)
})

// A collapsed day

test('a collapsed day has a button named after the date, with a short text', async () => {
  await renderPage()

  const button = within(await findDay(TUE)).getByRole('button', {
    name: 'Open Tuesday 17 November',
  })
  expect(button).toHaveTextContent(/^Tue 17 Nov$/)
})

test('a collapsed day shows its worked hours and number of entries, counting only billable labels as worked', async () => {
  await renderPage({
    entries: [
      { date: '2026-11-17', start: '08:00', end: '10:00' },
      { date: '2026-11-17', start: '10:00', end: '12:00' },
      { date: '2026-11-17', start: '12:00', end: '12:30', label: 'Admin' },
      { date: '2026-11-17', start: '12:30', end: '14:30' },
      { date: '2026-11-17', start: '15:00', end: '16:45' },
      { date: '2026-11-16', start: '09:00', end: '10:00' },
    ],
  })

  await findDay(WED)
  await waitForLine(TUE, '7:45 worked · 5 entries')
  await waitForLine(MON, '1:00 worked · 1 entry')
})

test('a collapsed day with only non-billable entries shows 0:00 worked', async () => {
  await renderPage({
    entries: [
      { date: '2026-11-17', start: '08:00', end: '10:00', label: 'Admin' },
    ],
  })

  await waitForLine(TUE, '0:00 worked · 1 entry')
})

test('a collapsed day without entries shows "Nothing logged"', async () => {
  await renderPage()

  await waitForLine(TUE, 'Nothing logged')
})

test('a collapsed day shows no entry rows and no forms', async () => {
  await renderPage({
    entries: [{ date: '2026-11-17', start: '09:00', end: '10:00' }],
  })

  await waitForLine(TUE, '1:00 worked · 1 entry')
  const section = within(day(TUE))
  expect(section.getAllByRole('button')).toEqual([
    section.getByRole('button', { name: `Open ${TUE}` }),
  ])
  expect(section.queryByRole('list')).not.toBeInTheDocument()
  expect(section.queryByRole('form')).not.toBeInTheDocument()
  expect(section.queryByRole('textbox')).not.toBeInTheDocument()
})

test('flags only the collapsed day whose entries overlap', async () => {
  await renderPage({
    entries: [
      { date: '2026-11-17', start: '09:00', end: '10:30' },
      { date: '2026-11-17', start: '10:00', end: '11:00', label: 'Admin' },
      { date: '2026-11-16', start: '09:00', end: '10:00' },
      { date: '2026-11-16', start: '10:00', end: '11:00' },
    ],
  })

  await waitForLine(TUE, '1:30 worked · 2 entries')
  expect(
    within(day(TUE)).getByText('overlaps', { selector: 'span.overlap-flag' }),
  ).toBeInTheDocument()
  await waitForLine(MON, '2:00 worked · 2 entries')
  expect(within(day(MON)).queryByText(/overlaps/)).not.toBeInTheDocument()
})

test('counts an entry that ends at 24:00 on the day it starts', async () => {
  await renderPage({
    entries: [{ date: '2026-11-16', start: '22:00', end: '00:00' }],
  })

  await waitForLine(MON, '2:00 worked · 1 entry')
  await waitForLine(TUE, 'Nothing logged')
})

test('counts an entry with a deleted billable label as worked', async () => {
  const { user } = await renderPage({
    entries: [{ date: '2026-11-17', start: '09:00', end: '10:30' }],
    deletedLabels: ['Client'],
  })

  await waitForLine(TUE, '1:30 worked · 1 entry')
  await open(user, TUE)
  expect(await within(day(TUE)).findByText('1:30 worked')).toBeInTheDocument()
})

test.each([
  ['forward', '2026-03-30', '2026-03-29', 'Sunday 29 March', '2:00'],
  ['back', '2026-10-26', '2026-10-25', 'Sunday 25 October', '4:00'],
])(
  'shows the real duration on the day the clocks go %s',
  async (_direction, today, date, name, worked) => {
    await renderPage({
      today,
      contract: monthly,
      entries: [{ date, start: '01:00', end: '04:00' }],
    })

    await waitFor(() => day(name))
    await waitForLine(name, `${worked} worked · 1 entry`)
  },
)

test('shows an entry of another time zone on its own local date', async () => {
  await renderPage({
    entries: [
      // Wednesday 02:00 in Amsterdam.
      {
        date: '2026-11-17',
        start: '20:00',
        end: '21:00',
        timeZone: 'America/New_York',
      },
      // Monday 20:00 in Amsterdam.
      {
        date: '2026-11-17',
        start: '08:00',
        end: '10:00',
        timeZone: 'Pacific/Auckland',
      },
      // Monday in Amsterdam, but Sunday of the week before in its own zone.
      {
        date: '2026-11-15',
        start: '22:00',
        end: '23:00',
        timeZone: 'America/New_York',
      },
    ],
  })

  await waitForLine(TUE, '3:00 worked · 2 entries')
  await waitForLine(MON, 'Nothing logged')
  expect(within(day(WED)).getByText('No entries')).toBeInTheDocument()
})

// The open day

test('the open day has a heading with the full date as its name and a short text', async () => {
  await renderPage()

  const heading = await within(await findDay(WED)).findByRole('heading', {
    level: 3,
    name: 'Wednesday 18 November 2026',
  })
  expect(heading).toHaveTextContent(/^Wed 18 Nov$/)
})

test('the open day shows its total, rows and add row', async () => {
  await renderPage({
    entries: [
      { date: '2026-11-18', start: '09:00', end: '10:00' },
      { date: '2026-11-18', start: '10:00', end: '10:30', label: 'Admin' },
    ],
  })

  const section = within(await findDay(WED))
  expect(await section.findByText('1:00 worked')).toBeInTheDocument()
  const list = section.getByRole('list', { name: 'Entries' })
  expect(within(list).getAllByRole('listitem')).toHaveLength(2)
  expect(section.getByRole('form', { name: 'Add entry' })).toBeInTheDocument()
  expect(section.queryByText('Some entries overlap')).not.toBeInTheDocument()
  expect(
    section.queryByRole('button', { name: `Open ${WED}` }),
  ).not.toBeInTheDocument()
})

test('the open day shows "No entries" when it is empty', async () => {
  await renderPage()

  const section = within(await findDay(WED))
  expect(await section.findByText('No entries')).toBeInTheDocument()
})

test('the open day warns when its entries overlap', async () => {
  await renderPage({
    entries: [
      { date: '2026-11-18', start: '09:00', end: '10:30' },
      { date: '2026-11-18', start: '10:00', end: '11:00' },
    ],
  })

  expect(
    await within(await findDay(WED)).findByRole('status'),
  ).toHaveTextContent('Some entries overlap')
})

test('only today has a "Today" pill, open or collapsed', async () => {
  const { user } = await renderPage()
  const pills = () =>
    Array.from(document.querySelectorAll('span.today-pill'), (pill) => ({
      text: pill.textContent,
      day: pill.closest('section'),
    }))

  await waitForOpen(WED)
  expect(pills()).toEqual([{ text: 'Today', day: day(WED) }])

  await open(user, TUE)
  expect(pills()).toEqual([{ text: 'Today', day: day(WED) }])
})

// Opening a day

test('clicking the button of a collapsed day opens it and collapses the day that was open', async () => {
  const { user } = await renderPage({
    entries: [
      {
        date: '2026-11-17',
        start: '09:00',
        end: '10:00',
        description: 'Review',
      },
      { date: '2026-11-18', start: '09:00', end: '11:00' },
    ],
  })

  await open(user, TUE)

  expect(
    within(day(TUE)).getByRole('heading', { name: 'Tuesday 17 November 2026' }),
  ).toBeInTheDocument()
  expect(await within(day(TUE)).findByText('Review')).toBeInTheDocument()
  await waitForLine(WED, '2:00 worked · 1 entry')
  expect(within(day(WED)).queryByRole('form')).not.toBeInTheDocument()
  await waitForDays([WED, TUE, MON])
})

test('clicking anywhere on a collapsed day opens it', async () => {
  const { user } = await renderPage({
    entries: [{ date: '2026-11-17', start: '09:00', end: '10:00' }],
  })
  await waitForLine(TUE, '1:00 worked · 1 entry')

  await user.click(within(day(TUE)).getByText('1:00 worked · 1 entry'))
  await waitForOpen(TUE)
  await waitForFocus(TUE, 'End')

  await user.click(day(MON))
  await waitForOpen(MON)
  await waitForFocus(MON, 'End')
})

test.each([
  ['Enter', '{Enter}'],
  ['Space', ' '],
])(
  'opens a day with %s on its button, without saving anything',
  async (_key, text) => {
    const { user, entries } = await renderPage({
      entries: [{ date: '2026-11-17', start: '09:00', end: '10:00' }],
    })
    const button = await screen.findByRole('button', { name: `Open ${TUE}` })
    act(() => button.focus())

    await user.keyboard(text)

    await waitForOpen(TUE)
    await waitForFocus(TUE, 'End')
    await waitForAddTimes(TUE, '10:00', '10:00')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(
      await entries.on(Temporal.PlainDate.from('2026-11-17')),
    ).toHaveLength(1)
  },
)

test('opening a day shows its prefill with focus on End', async () => {
  const { user } = await renderPage({
    entries: [{ date: '2026-11-17', start: '08:00', end: '09:15' }],
  })

  await open(user, TUE)

  await waitForFocus(TUE, 'End')
  await waitForAddTimes(TUE, '09:15', '09:15')
})

test('opening a day without a prefill puts focus on Start', async () => {
  const { user } = await renderPage({
    entries: [{ date: '2026-11-17', start: '22:00', end: '00:00' }],
  })

  await open(user, TUE)

  await waitForFocus(TUE, 'Start')
  await waitForAddTimes(TUE, '', '')
})

test('puts focus on End when the prefill of the opened day loads slowly', async () => {
  const prefill = heldPrefill('2026-11-17')
  const { user } = await renderPage({
    entries: [{ date: '2026-11-17', start: '08:00', end: '09:15' }],
    prepare: prefill.prepare,
  })

  await user.click(await screen.findByRole('button', { name: `Open ${TUE}` }))
  await prefill.release()

  await waitForFocus(TUE, 'End')
  await waitForAddTimes(TUE, '09:15', '09:15')
})

test('a slow prefill of one day does not show in another day opened since', async () => {
  const prefill = heldPrefill('2026-11-17')
  const { user } = await renderPage({
    entries: [
      { date: '2026-11-16', start: '08:00', end: '12:30' },
      { date: '2026-11-17', start: '08:00', end: '09:15' },
    ],
    prepare: prefill.prepare,
  })

  await user.click(await screen.findByRole('button', { name: `Open ${TUE}` }))
  await open(user, MON)
  await waitForAddTimes(MON, '12:30', '12:30')
  await prefill.release()

  await waitForOpen(MON)
  await waitForAddTimes(MON, '12:30', '12:30')
  await waitForFocus(MON, 'End')
})

test('opening a day discards what was typed in the add row', async () => {
  const { user } = await renderPage()
  const row = await findAddRow(WED)
  await user.type(
    row.getByRole('textbox', { name: 'Description' }),
    'Not saved',
  )
  await user.clear(row.getByRole('textbox', { name: 'End' }))
  await user.type(row.getByRole('textbox', { name: 'End' }), '17:00')

  await open(user, TUE)

  await waitForAddTimes(TUE, '09:00', '09:00')
  expect(
    (await findAddRow(TUE)).getByRole('textbox', { name: 'Description' }),
  ).toHaveValue('')

  await open(user, WED)

  await waitForAddTimes(WED, '09:00', '09:00')
  expect(
    (await findAddRow(WED)).getByRole('textbox', { name: 'Description' }),
  ).toHaveValue('')
})

test('opening a day closes an open editor and discards its changes', async () => {
  const { user } = await renderPage({
    entries: [
      {
        date: '2026-11-18',
        start: '09:00',
        end: '10:00',
        description: 'Email',
      },
    ],
  })
  await findDay(WED)
  const editor = await openEntry(user, WED, '09:00')
  await user.type(
    editor.getByRole('textbox', { name: 'Description' }),
    ' not saved',
  )

  await open(user, TUE)

  await waitForFocus(TUE, 'End')
  expect(
    screen.queryByRole('form', { name: 'Edit entry' }),
  ).not.toBeInTheDocument()

  await open(user, WED)

  expect(await within(day(WED)).findByText('Email')).toBeInTheDocument()
  expect(
    screen.queryByRole('form', { name: 'Edit entry' }),
  ).not.toBeInTheDocument()
  await waitForFocus(WED, 'End')
})

test('clicking in the open day keeps it open and keeps what was typed', async () => {
  const { user } = await renderPage()
  const section = await findDay(WED)
  const row = await findAddRow(WED)
  const description = row.getByRole('textbox', { name: 'Description' })
  await user.type(description, 'Typed')

  await user.click(section)
  await user.click(within(section).getByText('No entries'))
  await user.click(within(section).getByRole('heading', { level: 3 }))

  await waitForOpen(WED)
  expect(description).toBeInTheDocument()
  expect(description).toHaveValue('Typed')
  expect(row.getByRole('textbox', { name: 'End' })).not.toHaveFocus()
})

test('clicking in the open day keeps an open editor', async () => {
  const { user } = await renderPage({
    entries: [{ date: '2026-11-18', start: '09:00', end: '10:00' }],
  })
  await findDay(WED)
  const editor = await openEntry(user, WED, '09:00')
  const description = editor.getByRole('textbox', { name: 'Description' })
  await user.type(description, 'Typed')

  await user.click(day(WED))

  expect(description).toBeInTheDocument()
  expect(description).toHaveValue('Typed')
})

test('loading the page does not take focus', async () => {
  await renderPage({ contract: weekly })

  await waitForOpen(WED)
  await waitForAddTimes(WED, '09:00', '09:00')
  expect(document.body).toHaveFocus()
})

test('opening a day keeps the Expected field and its text', async () => {
  const { user } = await renderPage({ contract: weekly })
  await findDay(TUE)
  const field = await screen.findByRole('textbox', { name: 'Expected' })
  await user.type(field, 'abc')

  await open(user, TUE)

  await waitForFocus(TUE, 'End')
  expect(screen.getByRole('textbox', { name: 'Expected' })).toBe(field)
  expect(field).toHaveValue('abc')
})

test('the arrow buttons go to the neighbouring month', async () => {
  const { user } = await renderPage({ contract: monthly })
  await waitForOpen(WED)

  await clickArrow(user, 'Previous month')
  await waitFor(() => expect(allDays()).toHaveLength(31))
  await waitForOpen('Friday 30 October')

  await clickArrow(user, 'Next month')
  await waitFor(() => expect(allDays()).toHaveLength(18))
  await waitForOpen(WED)
})

test('the list follows the arrow buttons to another week', async () => {
  const { user } = await renderPage({
    today: '2026-11-23',
    entries: [{ date: '2026-11-18', start: '09:00', end: '10:00' }],
  })
  await waitForDays(['Monday 23 November'])

  await clickArrow(user, 'Previous week')

  await waitForDays(
    november(
      ['Sunday', 22],
      ['Saturday', 21],
      ['Friday', 20],
      ['Thursday', 19],
      ['Wednesday', 18],
      ['Tuesday', 17],
      ['Monday', 16],
    ),
  )
  await waitForOpen('Friday 20 November')
  await waitForLine(WED, '1:00 worked · 1 entry')

  await clickArrow(user, 'Next week')

  await waitForDays(['Monday 23 November'])
  await waitForOpen('Monday 23 November')
})

// Changing entries

test('adding an entry updates the line of its day and the totals', async () => {
  const { user } = await renderPage({ contract: weekly })
  await findDay(TUE)
  await open(user, TUE)

  await addEntry(user, TUE, '09:00', '10:15')

  expect(await within(day(TUE)).findByText('1:15 worked')).toBeInTheDocument()
  await waitForWorked('1:15')
  await open(user, WED)
  await waitForLine(TUE, '1:15 worked · 1 entry')
})

test('changing and deleting an entry updates the line of its day and the totals', async () => {
  const { user } = await renderPage({
    contract: weekly,
    entries: [{ date: '2026-11-18', start: '09:00', end: '10:00' }],
  })
  await findDay(WED)
  await waitForWorked('1:00')

  let editor = await openEntry(user, WED, '09:00')
  await user.clear(editor.getByRole('textbox', { name: 'End' }))
  await user.type(editor.getByRole('textbox', { name: 'End' }), '11:30')
  await user.click(editor.getByRole('button', { name: 'Save' }))
  expect(await within(day(WED)).findByText('2:30 worked')).toBeInTheDocument()
  await waitForWorked('2:30')
  await open(user, TUE)
  await waitForLine(WED, '2:30 worked · 1 entry')

  await open(user, WED)
  editor = await openEntry(user, WED, '09:00')
  await user.click(editor.getByRole('button', { name: 'Delete' }))
  await user.click(
    editor.getByRole('button', { name: 'Click again to delete' }),
  )
  expect(await within(day(WED)).findByText('No entries')).toBeInTheDocument()
  await waitForWorked('0:00')
  await open(user, TUE)
  await waitForLine(WED, 'Nothing logged')
})

// Slow loads

test('a slow load of another week does not show in the week gone back to', async () => {
  const loads = holdableLoads()
  const { user } = await renderPage({
    today: '2026-11-23',
    entries: [
      { date: '2026-11-18', start: '09:00', end: '17:00' },
      { date: '2026-11-23', start: '09:00', end: '10:00' },
    ],
    prepare: loads.prepare,
  })
  const monday = 'Monday 23 November'
  await waitForDays([monday])
  expect(
    await within(day(monday)).findByText('1:00 worked'),
  ).toBeInTheDocument()

  const previous = await screen.findByRole('button', { name: 'Previous week' })
  await waitFor(() => expect(previous).toBeEnabled())
  loads.holding = true
  await user.click(previous)
  await waitFor(() => expect(loads.held).toBeGreaterThan(0))
  // Nothing is known of the other week yet, and this week is no longer shown.
  expect(screen.queryByRole('region', { name: monday })).not.toBeInTheDocument()
  expect(screen.queryByText('Nothing logged')).not.toBeInTheDocument()
  expect(screen.queryByText('No entries')).not.toBeInTheDocument()

  loads.holding = false
  await clickArrow(user, 'Next week')
  await waitForDays([monday])
  await loads.release()

  await waitForDays([monday])
  expect(within(day(monday)).getByText('1:00 worked')).toBeInTheDocument()
})

test('a slow reload after one change does not overwrite the days after a later change', async () => {
  const loads = holdableLoads()
  const { user } = await renderPage({ prepare: loads.prepare })
  await waitForOpen(WED)

  loads.holding = true
  await addEntry(user, WED, '09:00', '10:00')
  await waitFor(() => expect(loads.held).toBeGreaterThan(0))
  loads.holding = false
  await addEntry(user, WED, '10:00', '12:00')
  expect(await within(day(WED)).findByText('3:00 worked')).toBeInTheDocument()

  await loads.release()

  expect(within(day(WED)).getByText('3:00 worked')).toBeInTheDocument()
  await open(user, TUE)
  await waitForLine(WED, '3:00 worked · 2 entries')
})

test('a slow reload after a change does not show in another week opened since', async () => {
  const loads = holdableLoads()
  const { user } = await renderPage({
    today: '2026-11-23',
    entries: [{ date: '2026-11-18', start: '09:00', end: '17:00' }],
    prepare: loads.prepare,
  })
  const monday = 'Monday 23 November'
  const friday = 'Friday 20 November'
  await waitForOpen(monday)

  loads.holding = true
  await addEntry(user, monday, '09:00', '10:00')
  await waitFor(() => expect(loads.held).toBeGreaterThan(0))
  loads.holding = false
  await clickArrow(user, 'Previous week')
  await waitForOpen(friday)
  await loads.release()

  await waitForOpen(friday)
  expect(allDays()).toHaveLength(7)
  await waitForLine(WED, '8:00 worked · 1 entry')
})

test('a slow reload after a change updates the line of its day when another day was opened since', async () => {
  const loads = holdableLoads()
  const { user } = await renderPage({ prepare: loads.prepare })
  await waitForOpen(WED)

  loads.holding = true
  await addEntry(user, WED, '09:00', '10:00')
  await waitFor(() => expect(loads.held).toBeGreaterThan(0))
  loads.holding = false
  await open(user, TUE)
  await waitForFocus(TUE, 'End')
  await loads.release()

  await waitForLine(WED, '1:00 worked · 1 entry')
  await waitForOpen(TUE)
  await waitForFocus(TUE, 'End')
})

test('opening another day of the week keeps the days shown, also while loading slowly', async () => {
  const loads = holdableLoads()
  const { user } = await renderPage({
    entries: [{ date: '2026-11-17', start: '09:00', end: '10:00' }],
    prepare: loads.prepare,
  })
  await waitForDays([WED, TUE, MON])
  await waitForLine(TUE, '1:00 worked · 1 entry')
  const stopWatching = watchForGaps()

  loads.holding = true
  await open(user, TUE)
  expect(within(day(TUE)).getByText('1:00 worked')).toBeInTheDocument()
  await loads.release()

  await waitForOpen(TUE)
  expect(stopWatching()).toBe(false)
})

test('an add that reloads the days keeps them shown', async () => {
  const { user } = await renderPage()
  await waitForDays([WED, TUE, MON])
  const stopWatching = watchForGaps()

  await addEntry(user, WED, '09:00', '10:00')

  expect(await within(day(WED)).findByText('1:00 worked')).toBeInTheDocument()
  expect(stopWatching()).toBe(false)
})

test('keeps the prefilled times when a description is typed before a slow prefill is loaded', async () => {
  const prefill = heldPrefill('2026-11-17')
  const { user } = await renderPage({
    entries: [{ date: '2026-11-17', start: '09:00', end: '10:30' }],
    prepare: prefill.prepare,
  })
  await open(user, TUE)
  const row = await findAddRow(TUE)
  await user.type(row.getByRole('textbox', { name: 'Description' }), 'Email')

  await prefill.release()

  await waitForAddTimes(TUE, '10:30', '10:30')
  expect(row.getByRole('textbox', { name: 'Description' })).toHaveValue('Email')
})

test('a slow save does not reopen an editor that was cancelled meanwhile', async () => {
  const { released, release } = releasable()
  const loads = holdableLoads()
  const { user } = await renderPage({
    entries: [{ date: '2026-11-18', start: '09:00', end: '10:00' }],
    prepare(entries) {
      loads.prepare(entries)
      const update = entries.update
      vi.spyOn(entries, 'update').mockImplementation(async (id, changes) => {
        await released
        return update(id, changes)
      })
    },
  })
  await findDay(WED)
  const form = await openEntry(user, WED, '09:00')
  await user.click(form.getByRole('button', { name: 'Save' }))
  await user.click(form.getByRole('button', { name: 'Cancel' }))
  await findAddRow(WED)

  // The reload after the save stays loading.
  loads.holding = true
  await release()
  expect(loads.held).toBeGreaterThan(0)

  expect(
    screen.queryByRole('form', { name: 'Edit entry' }),
  ).not.toBeInTheDocument()
  await loads.release()
})
