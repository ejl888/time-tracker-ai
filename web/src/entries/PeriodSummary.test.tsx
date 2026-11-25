import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Temporal } from 'temporal-polyfill'
import { describe, expect, test, vi } from 'vitest'
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
  /** The dates to store an entry on first. */
  entryDates?: string[]
}

/** Renders the Entries page on in-memory services, today at noon in Amsterdam. */
async function renderPage({
  today = '2026-11-25',
  contract,
  expected = {},
  entryDates = [],
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
  for (const date of entryDates) {
    const label = await labels.create('Client', { billable: true })
    if (!label.ok) throw new Error(`could not seed label: ${label.error}`)
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
  await screen.findByRole('heading', { level: 3 })
  return { user: userEvent.setup(), contracts, contract: saved }
}

/** Queries inside the "Period summary" region, once it is shown. */
async function findSummary() {
  return within(await screen.findByRole('region', { name: 'Period summary' }))
}

/** Queries inside the period bar, once it is shown. */
async function findBar() {
  return waitFor(() => {
    const bar = document.querySelector<HTMLElement>('.period-bar')
    expect(bar).toBeInTheDocument()
    return within(bar!)
  })
}

/** Clicks an arrow button of the period bar once it is enabled. */
async function clickArrow(
  user: ReturnType<typeof userEvent.setup>,
  name: string,
) {
  const button = await screen.findByRole('button', { name })
  await waitFor(() => expect(button).toBeEnabled())
  await user.click(button)
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

  const bar = await findBar()
  const summary = await findSummary()
  expect(await bar.findByText('Week 48')).toBeInTheDocument()
  expect(bar.getByText('23–29 Nov 2026')).toBeInTheDocument()
  expect(await findExpected()).toHaveValue('')
  expect(
    summary.getByText('Enter at the start of the week'),
  ).toBeInTheDocument()
})

test('shows both months for a week across two months', async () => {
  await renderPage({ today: '2027-01-01', contract: weekly })

  const bar = await findBar()
  expect(await bar.findByText('Week 53')).toBeInTheDocument()
  expect(bar.getByText('28 Dec – 3 Jan 2027')).toBeInTheDocument()
})

test('shows the month of the day for a monthly contract', async () => {
  await renderPage({ contract: monthly })

  const bar = await findBar()
  const summary = await findSummary()
  expect(await bar.findByText('November 2026')).toBeInTheDocument()
  expect(bar.getByText('Monthly billing period')).toBeInTheDocument()
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

test('shows the other week and its expected hours after going to the previous week', async () => {
  const { user } = await renderPage({
    today: '2026-11-23',
    contract: weekly,
    expected: { '2026-11-16': 30 * 60, '2026-11-23': 32 * 60 },
  })

  expect(await findExpected()).toHaveValue('32:00')

  await clickArrow(user, 'Previous week')

  const bar = await findBar()
  expect(await bar.findByText('Week 47')).toBeInTheDocument()
  expect(bar.getByText('16–22 Nov 2026')).toBeInTheDocument()
  await waitFor(async () => expect(await findExpected()).toHaveValue('30:00'))
})

test('says the day is before the contract start instead of showing the Expected field', async () => {
  const { user } = await renderPage({
    today: '2026-11-23',
    contract: { ...weekly, startDate: '2026-11-23' },
    entryDates: ['2026-11-18'],
  })

  await findExpected()
  await clickArrow(user, 'Previous week')

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

  const bar = await findBar()
  const summary = await findSummary()
  expect(await bar.findByText('Week 48')).toBeInTheDocument()
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

test('keeps the Expected value when moving to another day in the same week', async () => {
  const { user } = await renderPage({ contract: weekly })

  const field = await findExpected()
  await user.type(field, '40')
  await user.tab()
  await waitFor(() => expect(field).toHaveValue('40:00'))

  // Records whether the Expected field ever leaves the summary while the day changes.
  const region = screen.getByRole('region', { name: 'Period summary' })
  let emptied = false
  const observer = new MutationObserver(() => {
    if (!within(region).queryByRole('textbox', { name: 'Expected' })) {
      emptied = true
    }
  })
  observer.observe(region, { childList: true, subtree: true })

  await user.click(
    screen.getByRole('button', { name: 'Open Tuesday 24 November' }),
  )
  await screen.findByRole('heading', { name: 'Tuesday 24 November 2026' })

  observer.disconnect()
  expect(region).toBeInTheDocument()
  expect((await findBar()).getByText('Week 48')).toBeInTheDocument()
  expect(within(region).getByRole('textbox', { name: 'Expected' })).toHaveValue(
    '40:00',
  )
  expect(emptied).toBe(false)
})

test('marks the Expected field invalid and links it to the message', async () => {
  const { user } = await renderPage({ contract: weekly })

  const field = await findExpected()
  await user.type(field, 'abc')
  await user.tab()

  const summary = await findSummary()
  const alert = await summary.findByRole('alert')
  expect(field).toHaveAttribute('aria-invalid', 'true')
  const describedBy = field.getAttribute('aria-describedby')
  expect(describedBy).toBeTruthy()
  expect(describedBy!.split(' ')).toContain(alert.id)
  expect(field).toHaveAccessibleDescription('Use hours like 36 or 36:00')

  await user.clear(field)
  await user.type(field, '36')
  await user.tab()

  await waitFor(() => expect(field).toHaveValue('36:00'))
  expect(summary.queryByRole('alert')).not.toBeInTheDocument()
  expect(field.getAttribute('aria-invalid') ?? 'false').toBe('false')
})

test('shows the period title as a level 2 heading', async () => {
  await renderPage({ contract: weekly })

  const bar = await findBar()
  expect(
    await bar.findByRole('heading', { level: 2, name: 'Week 48' }),
  ).toBeInTheDocument()
})

test('explains the Expected label in a tooltip and keeps the field name', async () => {
  await renderPage({ contract: weekly })

  const field = await findExpected()
  expect(field).toHaveAccessibleName('Expected')
  const summary = await findSummary()
  expect(summary.getByText('Expected')).toHaveAttribute(
    'title',
    'Expected billable hours',
  )
})

test('gives the Expected field the invalid class until a valid value is saved', async () => {
  const { user, contracts, contract } = await renderPage({ contract: weekly })

  const field = await findExpected()
  expect(field).not.toHaveClass('invalid')
  await user.type(field, 'abc')
  await user.tab()
  await (await findSummary()).findByRole('alert')
  expect(field).toHaveClass('invalid')

  await user.clear(field)
  await user.type(field, '36')
  await user.tab()

  await waitFor(() => expect(field).toHaveValue('36:00'))
  expect(await contracts.expectedFor(contract!, '2026-11-23')).toBe(36 * 60)
  expect(field).not.toHaveClass('invalid')
})

describe.each<[string, Record<string, number>, string, number | undefined]>([
  ['a stored value', { '2026-11-23': 32 * 60 }, '32:00', 32 * 60],
  ['no stored value', {}, '', undefined],
])('Escape in the Expected field with %s', (_name, expected, text, stored) => {
  test('restores the saved text and stores nothing, also when the field is left', async () => {
    const { user, contracts, contract } = await renderPage({
      contract: weekly,
      expected,
    })
    const setExpected = vi.spyOn(contracts, 'setExpected')

    const field = await findExpected()
    await user.clear(field)
    await user.type(field, '40')
    await user.keyboard('{Escape}')
    expect(field).toHaveValue(text)

    await user.tab()

    expect(field).toHaveValue(text)
    // Saving the unchanged value would be harmless; the typed one must never be saved.
    expect(setExpected).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      40 * 60,
    )
    expect(await contracts.expectedFor(contract!, '2026-11-23')).toBe(stored)
  })

  test('clears the error and stores nothing, also when the field is left', async () => {
    const { user, contracts, contract } = await renderPage({
      contract: weekly,
      expected,
    })

    const field = await findExpected()
    await user.clear(field)
    await user.type(field, 'abc{Enter}')
    const summary = await findSummary()
    await summary.findByRole('alert')

    await user.click(field)
    await user.keyboard('{Escape}')
    expect(field).toHaveValue(text)
    expect(summary.queryByRole('alert')).not.toBeInTheDocument()
    expect(field.getAttribute('aria-invalid') ?? 'false').toBe('false')
    expect(field).not.toHaveClass('invalid')

    await user.tab()

    expect(field).toHaveValue(text)
    expect(summary.queryByRole('alert')).not.toBeInTheDocument()
    expect(await contracts.expectedFor(contract!, '2026-11-23')).toBe(stored)
  })
})

test('Escape in the Expected field restores the text saved since it was shown', async () => {
  const { user, contracts, contract } = await renderPage({
    contract: weekly,
    expected: { '2026-11-23': 32 * 60 },
  })

  const field = await findExpected()
  await user.clear(field)
  await user.type(field, '30')
  await user.tab()
  await waitFor(() => expect(field).toHaveValue('30:00'))

  await user.clear(field)
  await user.type(field, '20')
  await user.keyboard('{Escape}')
  expect(field).toHaveValue('30:00')
  await user.tab()

  expect(field).toHaveValue('30:00')
  expect(await contracts.expectedFor(contract!, '2026-11-23')).toBe(30 * 60)
})

test('keeps the saved Expected value when returning before the other week has loaded', async () => {
  const { user, contracts, contract } = await renderPage({
    today: '2026-11-23',
    contract: weekly,
    expected: { '2026-11-23': 32 * 60 },
  })
  const field = await findExpected()
  await user.clear(field)
  await user.type(field, '40')
  await user.tab()
  await waitFor(() => expect(field).toHaveValue('40:00'))

  // Week 47 stays loading until the end of the test.
  let finishLoading!: (expected: number | undefined) => void
  const loading = new Promise<number | undefined>((resolve) => {
    finishLoading = resolve
  })
  const load = contracts.expectedFor
  vi.spyOn(contracts, 'expectedFor').mockImplementation((of, periodStart) =>
    periodStart === '2026-11-16' ? loading : load(of, periodStart),
  )

  try {
    await clickArrow(user, 'Previous week')
    await screen.findByRole('heading', { name: 'Friday 20 November 2026' })
    await clickArrow(user, 'Next week')
    await screen.findByRole('heading', { name: 'Monday 23 November 2026' })

    await waitFor(async () => expect(await findExpected()).toHaveValue('40:00'))
    await user.click(await findExpected())
    await user.tab()

    expect(await findExpected()).toHaveValue('40:00')
    expect(await contracts.expectedFor(contract!, '2026-11-23')).toBe(40 * 60)
  } finally {
    await act(async () => finishLoading(undefined))
  }
})

test('uses the normal keyboard for Expected', async () => {
  await renderPage({ contract: weekly })

  const field = await findExpected()
  expect([null, 'text']).toContain(field.getAttribute('inputmode'))
})
