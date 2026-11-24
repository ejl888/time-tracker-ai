import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Temporal } from 'temporal-polyfill'
import { expect, test } from 'vitest'
import { fixedClock } from '../domain/clock.ts'
import {
  type ContractFields,
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

// The summary bar above the day on the Entries page (US-05, US-06): the
// period of the shown day and its expected billable hours.

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
}

/** Renders the Entries page on in-memory services, today at noon in Amsterdam. */
async function renderPage({
  today = '2026-11-25',
  contract,
  expected = {},
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
  let saved: Contract | undefined
  if (contract) {
    const result = await contracts.save(contract)
    if (!result.ok) throw new Error(`could not seed contract: ${result.error}`)
    saved = result.value
    for (const [periodStart, minutes] of Object.entries(expected)) {
      const set = await contracts.setExpected(saved, periodStart, minutes)
      if (!set.ok) throw new Error(`could not seed expected: ${set.error}`)
    }
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
  await screen.findByRole('heading', { name: 'Entries' })
  return { user: userEvent.setup(), contracts, contract: saved }
}

/** Queries inside the "Period summary" region, once it is shown. */
async function findSummary() {
  return within(await screen.findByRole('region', { name: 'Period summary' }))
}

/** The Expected field, once it is shown. */
async function findExpected() {
  const summary = await findSummary()
  return (await summary.findByRole('textbox', {
    name: 'Expected',
  })) as HTMLInputElement
}

test('asks to set up the contract when there is none, without an Expected field', async () => {
  await renderPage()

  const summary = await findSummary()
  expect(
    await summary.findByText('Set up your contract in Settings'),
  ).toBeInTheDocument()
  expect(
    summary.queryByRole('textbox', { name: 'Expected' }),
  ).not.toBeInTheDocument()
})

test('shows the week of the day with its dates and an Expected field', async () => {
  await renderPage({ contract: weekly })

  const summary = await findSummary()
  expect(await summary.findByText('Week 48')).toBeInTheDocument()
  expect(summary.getByText('23–29 Nov 2026')).toBeInTheDocument()
  expect(await findExpected()).toHaveValue('')
  expect(
    summary.getByText('Enter at the start of the week'),
  ).toBeInTheDocument()
})

test('shows both months for a week across two months', async () => {
  await renderPage({ today: '2027-01-01', contract: weekly })

  const summary = await findSummary()
  expect(await summary.findByText('Week 53')).toBeInTheDocument()
  expect(summary.getByText('28 Dec – 3 Jan 2027')).toBeInTheDocument()
})

test('shows the month of the day for a monthly contract', async () => {
  await renderPage({ contract: monthly })

  const summary = await findSummary()
  expect(await summary.findByText('November 2026')).toBeInTheDocument()
  expect(summary.getByText('Monthly billing period')).toBeInTheDocument()
  expect(await findExpected()).toHaveValue('')
  expect(
    summary.getByText('Enter at the start of the month'),
  ).toBeInTheDocument()
})

test('shows the stored expected hours with the limit', async () => {
  await renderPage({
    contract: weekly,
    expected: { '2026-11-23': 32 * 60 },
  })

  expect(await findExpected()).toHaveValue('32:00')
  const summary = await findSummary()
  expect(summary.getByText('Limit 36:00')).toBeInTheDocument()
})

test('says the expected hours are capped when they are above the limit', async () => {
  await renderPage({
    contract: weekly,
    expected: { '2026-11-23': 40 * 60 },
  })

  expect(await findExpected()).toHaveValue('40:00')
  const summary = await findSummary()
  expect(summary.getByText('Capped at 36:00 by contract')).toBeInTheDocument()
})

test('stores the expected hours for the week when the field is left', async () => {
  const { user, contracts, contract } = await renderPage({ contract: weekly })

  const field = await findExpected()
  await user.type(field, '36')
  await user.tab()

  await waitFor(async () => {
    expect(await contracts.expectedFor(contract!, '2026-11-23')).toBe(36 * 60)
  })
  await waitFor(() => expect(field).toHaveValue('36:00'))
  const summary = await findSummary()
  expect(await summary.findByText('Limit 36:00')).toBeInTheDocument()
})

test('stores the expected hours when Enter is pressed', async () => {
  const { user, contracts, contract } = await renderPage({ contract: weekly })

  const field = await findExpected()
  await user.type(field, '36{Enter}')

  await waitFor(async () => {
    expect(await contracts.expectedFor(contract!, '2026-11-23')).toBe(36 * 60)
  })
  await waitFor(() => expect(field).toHaveValue('36:00'))
})

test('stores the expected hours for the month start with a monthly contract', async () => {
  const { user, contracts, contract } = await renderPage({ contract: monthly })

  const field = await findExpected()
  await user.type(field, '120:30')
  await user.tab()

  await waitFor(async () => {
    expect(await contracts.expectedFor(contract!, '2026-11-01')).toBe(
      120 * 60 + 30,
    )
  })
  await waitFor(() => expect(field).toHaveValue('120:30'))
})

test('shows the cap after entering more than the limit', async () => {
  const { user } = await renderPage({ contract: weekly })

  const field = await findExpected()
  await user.type(field, '40')
  await user.tab()

  const summary = await findSummary()
  expect(
    await summary.findByText('Capped at 36:00 by contract'),
  ).toBeInTheDocument()
})

test('clears the expected hours when the field is emptied', async () => {
  const { user, contracts, contract } = await renderPage({
    contract: weekly,
    expected: { '2026-11-23': 32 * 60 },
  })

  const field = await findExpected()
  await waitFor(() => expect(field).toHaveValue('32:00'))
  await user.clear(field)
  await user.tab()

  await waitFor(async () => {
    expect(await contracts.expectedFor(contract!, '2026-11-23')).toBeUndefined()
  })
  const summary = await findSummary()
  expect(
    await summary.findByText('Enter at the start of the week'),
  ).toBeInTheDocument()
})

test.each(['36.5', '-4', 'abc'])(
  'rejects "%s" and stores nothing',
  async (typed) => {
    const { user, contracts, contract } = await renderPage({
      contract: weekly,
    })

    const field = await findExpected()
    await user.type(field, typed)
    await user.tab()

    const summary = await findSummary()
    expect(await summary.findByRole('alert')).toHaveTextContent(
      'Use hours like 36 or 36:00',
    )
    expect(await contracts.expectedFor(contract!, '2026-11-23')).toBeUndefined()
  },
)

test('shows the other week and its expected hours after going to the previous day', async () => {
  const { user } = await renderPage({
    today: '2026-11-23',
    contract: weekly,
    expected: { '2026-11-16': 30 * 60, '2026-11-23': 32 * 60 },
  })

  expect(await findExpected()).toHaveValue('32:00')

  await user.click(screen.getByRole('button', { name: 'Previous day' }))

  const summary = await findSummary()
  expect(await summary.findByText('Week 47')).toBeInTheDocument()
  expect(summary.getByText('16–22 Nov 2026')).toBeInTheDocument()
  await waitFor(async () => expect(await findExpected()).toHaveValue('30:00'))
})

test('says the day is before the contract start instead of showing the Expected field', async () => {
  const { user } = await renderPage({
    today: '2026-11-23',
    contract: { ...weekly, startDate: '2026-11-23' },
  })

  await findExpected()
  await user.click(screen.getByRole('button', { name: 'Previous day' }))

  const summary = await findSummary()
  expect(
    await summary.findByText('Before your contract starts'),
  ).toBeInTheDocument()
  expect(
    summary.queryByRole('textbox', { name: 'Expected' }),
  ).not.toBeInTheDocument()
})

test('shows the week that holds a midweek contract start, with its Expected field', async () => {
  const { user, contracts, contract } = await renderPage({
    today: '2026-11-23',
    contract: { ...weekly, startDate: '2026-11-25' },
  })

  const summary = await findSummary()
  expect(await summary.findByText('Week 48')).toBeInTheDocument()
  expect(
    summary.queryByText('Before your contract starts'),
  ).not.toBeInTheDocument()

  const field = await findExpected()
  await user.type(field, '36')
  await user.tab()

  await waitFor(async () => {
    expect(await contracts.expectedFor(contract!, '2026-11-23')).toBe(36 * 60)
  })
})
