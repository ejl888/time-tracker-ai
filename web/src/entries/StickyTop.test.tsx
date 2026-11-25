import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Temporal } from 'temporal-polyfill'
import { expect, test, vi } from 'vitest'
import { fixedClock } from '../domain/clock.ts'
import {
  type ContractFields,
  type ContractService,
  createContractService,
} from '../domain/contracts.ts'
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

// The part of the Entries page that stays at the top while scrolling (US-18).

const timeZone = 'Europe/Amsterdam'

const weekly: ContractFields = {
  startDate: '2026-11-02',
  billingCycle: 'week',
  billableLimit: 36 * 60,
  startingBalance: 0,
}

const monthly: ContractFields = {
  startDate: '2026-11-01',
  billingCycle: 'month',
  billableLimit: 150 * 60,
  startingBalance: 0,
}

interface Setup {
  /** Today in Amsterdam; the page opens on this day. Wed 25 Nov 2026 (week 48) by default. */
  today?: string
  /** The contract to save first; none when left out. */
  contract?: ContractFields
  /** Expected minutes to store first, by period start. */
  expected?: Record<string, number>
  /** The dates to store an entry on first. */
  entryDates?: string[]
  /** Runs on the contract service after seeding, before the page renders. */
  prepare?: (contracts: ContractService) => void
}

/** Renders the Entries page on in-memory services, today at noon in Amsterdam. */
async function renderPage({
  today = '2026-11-25',
  contract,
  expected = {},
  entryDates = [],
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
  const label = await labels.create('Client', { billable: true })
  if (!label.ok) throw new Error(`could not seed label: ${label.error}`)
  for (const date of entryDates) {
    const added = await entries.add({
      date: Temporal.PlainDate.from(date),
      start: Temporal.PlainTime.from('09:00'),
      end: Temporal.PlainTime.from('10:00'),
      labelId: label.value.id,
      description: '',
      timeZone,
    })
    if (!added.ok) throw new Error(`could not seed entry: ${added.error}`)
  }
  if (contract) {
    const result = await contracts.save(contract)
    if (!result.ok) throw new Error(`could not seed contract: ${result.error}`)
    for (const [periodStart, minutes] of Object.entries(expected)) {
      const set = await contracts.setExpected(
        result.value,
        periodStart,
        minutes,
      )
      if (!set.ok) throw new Error(`could not seed expected: ${set.error}`)
    }
  }
  prepare?.(contracts)
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

/** Waits until the bar names this period and the Expected field is shown. */
async function waitForPeriod(title: string) {
  await screen.findByRole('heading', { level: 2, name: title })
  return screen.findByRole('textbox', { name: 'Expected' })
}

/** The spans under the period title, as their text and the classes that tell them apart. */
function periodSubs() {
  const subs = document.querySelectorAll('.period-bar span.period-sub')
  return [...subs].map((sub) => ({
    text: sub.textContent,
    full: sub.classList.contains('full'),
    short: sub.classList.contains('short'),
  }))
}

/** The texts of the notes that stay visible on a phone. */
function keptNotes() {
  return [...document.querySelectorAll('.keep')].map((note) => note.textContent)
}

// What stays at the top

test('keeps only the period bar and the summary at the top', async () => {
  await renderPage({ contract: weekly })
  await waitForPeriod('Week 48')
  const heading = await screen.findByRole('heading', { level: 3 })

  const top = document.querySelector('div.sticky-top')
  expect(top).toBeInTheDocument()
  expect([...top!.children]).toEqual([
    document.querySelector('div.period-bar'),
    screen.getByRole('region', { name: 'Period summary' }),
  ])
  expect(top).not.toContainElement(heading)
})

test('keeps the note to set up a contract at the top', async () => {
  await renderPage()

  const note = await screen.findByText('Set up your contract in Settings')
  expect(note.closest('div.sticky-top')).toBeInTheDocument()
})

// Short dates

test.each([
  ['2026-11-25', 'Week 48', '23–29 Nov 2026', '· 23–29 Nov'],
  ['2026-12-02', 'Week 49', '30 Nov – 6 Dec 2026', '· 30 Nov – 6 Dec'],
  ['2027-01-01', 'Week 53', '28 Dec – 3 Jan 2027', '· 28 Dec – 3 Jan'],
])(
  'has the full and then the short dates on %s, in %s',
  async (today, title, full, short) => {
    await renderPage({ today, contract: weekly })
    await waitForPeriod(title)

    expect(periodSubs()).toEqual([
      { text: full, full: true, short: false },
      { text: short, full: false, short: true },
    ])
  },
)

test('has no short dates for a monthly contract', async () => {
  await renderPage({ contract: monthly })
  await waitForPeriod('November 2026')

  expect(periodSubs()).toEqual([
    { text: 'Monthly billing period', full: true, short: false },
  ])
})

test('has no dates until the contract is loaded', async () => {
  let release!: () => void
  const released = new Promise<void>((done) => {
    release = done
  })
  await renderPage({
    contract: weekly,
    prepare(contracts) {
      const load = contracts.current
      vi.spyOn(contracts, 'current').mockImplementation(async () => {
        await released
        return load()
      })
    },
  })
  expect(periodSubs()).toEqual([])

  await act(async () => release())

  await waitForPeriod('Week 48')
  expect(periodSubs()).toContainEqual({
    text: '· 23–29 Nov',
    full: false,
    short: true,
  })
})

// The notes that stay on a phone

test('keeps the note of a capped value and of no other metric', async () => {
  await renderPage({
    contract: weekly,
    expected: { '2026-11-23': 40 * 60 },
    entryDates: ['2026-11-24'],
  })
  await waitForPeriod('Week 48')

  expect(screen.getByText('Capped at 36:00 by contract')).toHaveClass(
    'n',
    'keep',
  )
  expect(keptNotes()).toEqual(['Capped at 36:00 by contract'])
})

test('keeps only the note of a capped value in a past week', async () => {
  const { user } = await renderPage({
    contract: weekly,
    expected: { '2026-11-16': 40 * 60 },
  })
  await waitForPeriod('Week 48')
  expect(keptNotes()).toEqual([])
  const previous = screen.getByRole('button', { name: 'Previous week' })
  await waitFor(() => expect(previous).toBeEnabled())

  await user.click(previous)

  await screen.findByText('Balance after')
  expect(keptNotes()).toEqual(['Capped at 36:00 by contract'])
})

test('keeps the note while a capped value is typed, and not the other notes', async () => {
  const { user } = await renderPage({ contract: weekly })
  const field = await waitForPeriod('Week 48')
  expect(screen.getByText('Enter at the start of the week')).not.toHaveClass(
    'keep',
  )

  await user.type(field, '36')
  expect(screen.getByText('Limit 36:00')).not.toHaveClass('keep')

  await user.clear(field)
  await user.type(field, '40')
  expect(screen.getByText('Capped at 36:00 by contract')).toHaveClass('keep')

  await user.clear(field)
  expect(screen.getByText('Enter at the start of the week')).not.toHaveClass(
    'keep',
  )
})

test('shows an error instead of the kept note', async () => {
  const { user } = await renderPage({
    contract: weekly,
    expected: { '2026-11-23': 40 * 60 },
  })
  const field = await waitForPeriod('Week 48')
  expect(keptNotes()).toEqual(['Capped at 36:00 by contract'])

  await user.clear(field)
  await user.type(field, 'abc')
  await user.tab()

  const error = await screen.findByRole('alert')
  expect(error).toHaveClass('n err', { exact: true })
  expect(keptNotes()).toEqual([])
})
