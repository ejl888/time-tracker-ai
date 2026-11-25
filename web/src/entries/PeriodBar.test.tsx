import { act, render, screen, waitFor, within } from '@testing-library/react'
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

// The bar that names the period on the Entries page and goes to other periods (US-05, US-07, US-17).

const timeZone = 'Europe/Amsterdam'

/** Starts in week 45. */
const weekly: ContractFields = {
  startDate: '2026-11-02',
  billingCycle: 'week',
  billableLimit: 36 * 60,
  startingBalance: 0,
}

const monthly: ContractFields = {
  startDate: '2026-09-15',
  billingCycle: 'month',
  billableLimit: 150 * 60,
  startingBalance: 0,
}

interface Setup {
  /** Today in Amsterdam. Wed 18 Nov 2026 by default, in week 47 from Mon 16 Nov. */
  today?: string
  contract?: ContractFields
  /** The dates with an entry from 09:00 to 10:00. */
  entryDates?: string[]
  /** Runs on the services after seeding, before the page renders. */
  prepare?: (services: {
    entries: EntryService
    contracts: ContractService
  }) => void
}

/** Renders the Entries page on in-memory services, today at noon in Amsterdam. */
async function renderPage({
  today = '2026-11-18',
  contract,
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
  let saved: Contract | undefined
  if (contract) {
    const result = await contracts.save(contract)
    if (!result.ok) throw new Error(`could not seed contract: ${result.error}`)
    saved = result.value
  }
  prepare?.({ entries, contracts })
  render(
    <EntriesPage
      entries={entries}
      labels={labels}
      contracts={contracts}
      clock={clock}
      timeZone={timeZone}
    />,
  )
  return { user: userEvent.setup(), contracts, contract: saved }
}

type User = ReturnType<typeof userEvent.setup>

/** Queries inside the period bar. */
function bar() {
  const found = document.querySelector<HTMLElement>('div.period-bar')
  if (!found) throw new Error('there is no period bar')
  return within(found)
}

/** Waits until the bar shows this period and the list this open day, e.g. "Friday 13 November 2026". */
async function waitForPeriod(title: string, sub: string, openDay: string) {
  await waitFor(() => {
    const heading = bar().getByRole('heading', { level: 2 })
    expect(heading).toHaveTextContent(title)
    expect(heading).toHaveClass('period-title')
    expect(
      bar().getByText(sub, { selector: 'span.period-sub' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 3 })).toHaveAccessibleName(
      openDay,
    )
  })
}

// The weeks of the weekly contract.
const week45 = () =>
  waitForPeriod('Week 45', '2–8 Nov 2026', 'Friday 6 November 2026')
const week46 = () =>
  waitForPeriod('Week 46', '9–15 Nov 2026', 'Friday 13 November 2026')
const week47 = () =>
  waitForPeriod('Week 47', '16–22 Nov 2026', 'Wednesday 18 November 2026')

/** A button of the bar. */
function button(name: string) {
  return bar().getByRole('button', { name })
}

function todayButton() {
  return screen.queryByRole('button', { name: 'Go to today' })
}

async function waitForEnabled(name: string) {
  await waitFor(() => expect(button(name)).toBeEnabled())
}

async function waitForDisabled(name: string) {
  await waitFor(() => expect(button(name)).toBeDisabled())
}

/** Clicks a button of the bar, once it is enabled. */
async function click(user: User, name: string) {
  await waitForEnabled(name)
  await user.click(button(name))
}

/** The add row of the open day, once its prefill is shown. */
async function findAddRow() {
  const row = within(await screen.findByRole('form', { name: 'Add entry' }))
  await waitFor(() =>
    expect(row.getByRole('textbox', { name: 'Start' })).not.toHaveValue(''),
  )
  return row
}

/** Opens a collapsed day, e.g. "Tuesday 10 November". */
async function openDay(user: User, name: string) {
  await user.click(await screen.findByRole('button', { name: `Open ${name}` }))
  await screen.findByRole('heading', {
    level: 3,
    name: new RegExp(`^${name} `),
  })
}

/** Adds an entry from 09:00 to 10:00 to the open day. */
async function addEntry(user: User) {
  const row = await findAddRow()
  await user.clear(row.getByRole('textbox', { name: 'Start' }))
  await user.type(row.getByRole('textbox', { name: 'Start' }), '09:00')
  await user.clear(row.getByRole('textbox', { name: 'End' }))
  await user.type(row.getByRole('textbox', { name: 'End' }), '10:00')
  await user.selectOptions(
    row.getByRole('combobox', { name: 'Label' }),
    row.getByRole('option', { name: 'Client' }),
  )
  await user.click(row.getByRole('button', { name: 'Add' }))
  await screen.findByRole('button', { name: /^09:00–10:00/ })
}

/** Opens the editor of the only entry of the open day. */
async function openEditor(user: User) {
  await user.click(await screen.findByRole('button', { name: /^09:00–10:00/ }))
  return within(await screen.findByRole('form', { name: 'Edit entry' }))
}

/** Deletes the only entry of the open day. */
async function deleteEntry(user: User) {
  const editor = await openEditor(user)
  await user.click(editor.getByRole('button', { name: 'Delete' }))
  await user.click(
    editor.getByRole('button', { name: 'Click again to delete' }),
  )
  await screen.findByText('No entries')
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
 * Makes the loads of `entries.firstDate` controllable. While `holding` is true, a load reads its
 * date at once but only resolves after `release`.
 */
function holdableFirstDate() {
  const { released, release } = releasable()
  const loads = {
    holding: false,
    /** How many loads were held. */
    held: 0,
    release,
    prepare({ entries }: { entries: EntryService }) {
      const load = entries.firstDate
      vi.spyOn(entries, 'firstDate').mockImplementation(async () => {
        const hold = loads.holding
        if (hold) loads.held += 1
        const loaded = await load()
        if (hold) await released
        return loaded
      })
    },
  }
  return loads
}

// What the bar shows

test('shows the current week with its dates', async () => {
  await renderPage({ contract: weekly })

  await week47()
})

test('shows the current month with a monthly contract', async () => {
  await renderPage({ contract: monthly })

  await waitForPeriod(
    'November 2026',
    'Monthly billing period',
    'Wednesday 18 November 2026',
  )
  expect(button('Previous month')).toBeInTheDocument()
  expect(button('Next month')).toBeInTheDocument()
  expect(
    screen.queryByRole('button', { name: /(Previous|Next) week/ }),
  ).not.toBeInTheDocument()
})

test('has no buttons to go from day to day', async () => {
  await renderPage({ contract: weekly })

  await week47()
  for (const name of ['Previous day', 'Next day', 'Today']) {
    expect(screen.queryByRole('button', { name })).not.toBeInTheDocument()
  }
})

test('names the period only in the bar, not in the summary', async () => {
  await renderPage({ contract: weekly })

  await week47()
  const summary = within(screen.getByRole('region', { name: 'Period summary' }))
  expect(await summary.findByText('Balance in')).toBeInTheDocument()
  expect(summary.queryByRole('heading')).not.toBeInTheDocument()
  expect(summary.queryByText('Week 47')).not.toBeInTheDocument()
  expect(summary.queryByText('16–22 Nov 2026')).not.toBeInTheDocument()
})

test('does not show a week while the monthly contract is loading', async () => {
  const { released, release } = releasable()
  await renderPage({
    contract: monthly,
    prepare({ contracts }) {
      const load = contracts.current
      vi.spyOn(contracts, 'current').mockImplementation(async () => {
        await released
        return load()
      })
    },
  })
  expect(screen.queryByText(/^Week/)).not.toBeInTheDocument()

  await release()

  await waitForPeriod(
    'November 2026',
    'Monthly billing period',
    'Wednesday 18 November 2026',
  )
  await waitForEnabled('Previous month')
})

// Going to other periods

test('goes back to the week of the contract start and forward to the current week', async () => {
  const { user } = await renderPage({ contract: weekly })
  await week47()
  await waitForEnabled('Previous week')
  expect(button('Next week')).toBeDisabled()

  await click(user, 'Previous week')
  await week46()
  expect(button('Previous week')).toBeEnabled()
  expect(button('Next week')).toBeEnabled()

  await click(user, 'Previous week')
  await week45()
  expect(button('Previous week')).toBeDisabled()

  await click(user, 'Next week')
  await week46()
  await click(user, 'Next week')
  await week47()
  expect(button('Next week')).toBeDisabled()
})

test('goes from month to month', async () => {
  const { user } = await renderPage({ contract: monthly })

  await click(user, 'Previous month')
  await waitForPeriod(
    'October 2026',
    'Monthly billing period',
    'Friday 30 October 2026',
  )
  await click(user, 'Previous month')
  await waitForPeriod(
    'September 2026',
    'Monthly billing period',
    'Wednesday 30 September 2026',
  )
  expect(button('Previous month')).toBeDisabled()

  await click(user, 'Next month')
  await click(user, 'Next month')
  await waitForPeriod(
    'November 2026',
    'Monthly billing period',
    'Wednesday 18 November 2026',
  )
  expect(button('Next month')).toBeDisabled()
})

test('opens a past week on Friday and the current week on today, also after opening other days', async () => {
  const { user } = await renderPage({ contract: weekly })
  await week47()
  await openDay(user, 'Monday 16 November')

  await click(user, 'Previous week')
  await week46()
  await openDay(user, 'Tuesday 10 November')

  await click(user, 'Previous week')
  await week45()
  await click(user, 'Next week')
  await week46()
  await click(user, 'Next week')
  await week47()
})

test('goes over the year boundary from week 1 to week 53 and back', async () => {
  const { user } = await renderPage({ today: '2027-01-06', contract: weekly })
  await waitForPeriod('Week 1', '4–10 Jan 2027', 'Wednesday 6 January 2027')

  await click(user, 'Previous week')
  await waitForPeriod('Week 53', '28 Dec – 3 Jan 2027', 'Friday 1 January 2027')
  await click(user, 'Previous week')
  await waitForPeriod('Week 52', '21–27 Dec 2026', 'Friday 25 December 2026')

  await click(user, 'Next week')
  await click(user, 'Next week')
  await waitForPeriod('Week 1', '4–10 Jan 2027', 'Wednesday 6 January 2027')
})

test('goes over the year boundary from January to December and back', async () => {
  const { user } = await renderPage({ today: '2027-01-06', contract: monthly })

  await click(user, 'Previous month')
  await waitForPeriod(
    'December 2026',
    'Monthly billing period',
    'Thursday 31 December 2026',
  )
  await click(user, 'Next month')
  await waitForPeriod(
    'January 2027',
    'Monthly billing period',
    'Wednesday 6 January 2027',
  )
})

// Go to today

test('shows "Go to today" only when another period than the current is shown', async () => {
  const { user } = await renderPage({ contract: weekly })
  await week47()
  expect(todayButton()).not.toBeInTheDocument()
  await openDay(user, 'Monday 16 November')
  expect(todayButton()).not.toBeInTheDocument()

  await click(user, 'Previous week')
  await week46()
  expect(button('Go to today')).toHaveAttribute('title', 'Go to today')
  expect(button('Go to today')).toHaveAttribute('aria-label', 'Go to today')

  await click(user, 'Next week')
  await week47()
  expect(todayButton()).not.toBeInTheDocument()
})

test('"Go to today" goes to the current week with today open and focus on Previous', async () => {
  const { user } = await renderPage({ contract: weekly })
  await week47()
  await openDay(user, 'Monday 16 November')
  await click(user, 'Previous week')
  await week46()
  await click(user, 'Previous week')
  await week45()

  await click(user, 'Go to today')

  await week47()
  expect(todayButton()).not.toBeInTheDocument()
  await findAddRow()
  expect(button('Previous week')).toHaveFocus()
})

test('"Go to today" works from the keyboard in a month', async () => {
  const { user } = await renderPage({ contract: monthly })
  await click(user, 'Previous month')
  await screen.findByRole('heading', { name: 'Friday 30 October 2026' })

  act(() => button('Go to today').focus())
  await user.keyboard('{Enter}')

  await waitForPeriod(
    'November 2026',
    'Monthly billing period',
    'Wednesday 18 November 2026',
  )
  await findAddRow()
  expect(button('Previous month')).toHaveFocus()
})

// Focus and unsaved input

test('keeps focus on the arrow button that is used, or the other one when it becomes disabled', async () => {
  const { user } = await renderPage({ contract: weekly })
  await waitForEnabled('Previous week')
  act(() => button('Previous week').focus())

  await user.keyboard('{Enter}')
  await week46()
  await findAddRow()
  expect(button('Previous week')).toHaveFocus()

  // Week 45 is the first one.
  await user.keyboard('{Enter}')
  await week45()
  await findAddRow()
  expect(button('Previous week')).toBeDisabled()
  expect(button('Next week')).toHaveFocus()

  await user.keyboard('{Enter}')
  await week46()
  await findAddRow()
  expect(button('Next week')).toHaveFocus()

  // Week 47 is the last one.
  await user.keyboard('{Enter}')
  await week47()
  await findAddRow()
  expect(button('Next week')).toBeDisabled()
  expect(button('Previous week')).toHaveFocus()
})

test('keeps focus on the arrow button after an entry was added', async () => {
  const { user } = await renderPage({ contract: weekly })
  await week47()
  await addEntry(user)

  await click(user, 'Previous week')

  await week46()
  await findAddRow()
  expect(button('Previous week')).toHaveFocus()
})

test('loading the page does not move focus to the bar', async () => {
  await renderPage({ contract: weekly })

  await week47()
  await waitForEnabled('Previous week')
  expect(document.body).toHaveFocus()
})

test('going to another week closes an open editor and discards its changes', async () => {
  const { user } = await renderPage({
    contract: weekly,
    entryDates: ['2026-11-18'],
  })
  await week47()
  const editor = await openEditor(user)
  await user.type(
    editor.getByRole('textbox', { name: 'Description' }),
    'Not saved',
  )

  await click(user, 'Previous week')
  await week46()
  expect(
    screen.queryByRole('form', { name: 'Edit entry' }),
  ).not.toBeInTheDocument()

  await click(user, 'Next week')
  await week47()
  expect(
    await screen.findByRole('button', { name: /^09:00–10:00/ }),
  ).toBeInTheDocument()
  expect(
    screen.queryByRole('form', { name: 'Edit entry' }),
  ).not.toBeInTheDocument()
  expect(screen.queryByText(/Not saved/)).not.toBeInTheDocument()
})

test('going to another week discards what was typed in the add row', async () => {
  const { user } = await renderPage({ contract: weekly })
  await week47()
  const description = async () =>
    (await findAddRow()).getByRole('textbox', { name: 'Description' })
  await user.type(await description(), 'Not saved')

  await click(user, 'Previous week')
  await week46()
  expect(await description()).toHaveValue('')

  await user.type(await description(), 'Not saved')
  await click(user, 'Go to today')
  await week47()
  expect(await description()).toHaveValue('')
})

// The first period

test('shows only the current week without a contract and entries', async () => {
  await renderPage()

  await week47()
  expect(
    await screen.findByText('Set up your contract in Settings'),
  ).toBeInTheDocument()
  await findAddRow()
  expect(button('Previous week')).toBeDisabled()
  expect(button('Next week')).toBeDisabled()
  expect(todayButton()).not.toBeInTheDocument()
})

test('goes back to the earliest entry without a contract', async () => {
  const { user } = await renderPage({ entryDates: ['2026-11-10'] })
  await week47()

  await click(user, 'Previous week')

  await week46()
  expect(button('Previous week')).toBeDisabled()
  expect(
    screen.getByText('Set up your contract in Settings'),
  ).toBeInTheDocument()
  expect(screen.getByText('1:00 worked · 1 entry')).toBeInTheDocument()
})

test('shows only the current week when the contract starts later', async () => {
  await renderPage({ contract: { ...weekly, startDate: '2026-12-07' } })

  await week47()
  expect(
    await screen.findByText('Before your contract starts'),
  ).toBeInTheDocument()
  await findAddRow()
  expect(button('Previous week')).toBeDisabled()
  expect(button('Next week')).toBeDisabled()
})

test('lists the days of a week before the contract start that has an entry', async () => {
  const { user } = await renderPage({
    contract: { ...weekly, startDate: '2026-11-16' },
    entryDates: ['2026-11-10'],
  })

  await click(user, 'Previous week')

  await week46()
  expect(
    await screen.findByText('Before your contract starts'),
  ).toBeInTheDocument()
  expect(document.querySelectorAll('section.day')).toHaveLength(7)
  expect(
    within(
      screen.getByRole('region', { name: 'Tuesday 10 November' }),
    ).getByText('1:00 worked · 1 entry'),
  ).toBeInTheDocument()
  expect(button('Previous week')).toBeDisabled()
})

test('deleting the earliest entry makes its week unavailable', async () => {
  const { user } = await renderPage({
    entryDates: ['2026-11-04', '2026-11-11'],
  })
  await click(user, 'Previous week')
  await week46()
  await click(user, 'Previous week')
  await week45()
  await openDay(user, 'Wednesday 4 November')
  await deleteEntry(user)

  expect(button('Previous week')).toBeDisabled()
  await click(user, 'Next week')
  await week46()
  await waitForDisabled('Previous week')
  await click(user, 'Next week')
  await week47()
  await waitForEnabled('Previous week')
})

test('adding an entry on an earlier day makes its week available again', async () => {
  const { user } = await renderPage({ entryDates: ['2026-11-11'] })
  await click(user, 'Previous week')
  await week46()
  await openDay(user, 'Wednesday 11 November')
  await deleteEntry(user)
  await openDay(user, 'Tuesday 10 November')
  await addEntry(user)

  await click(user, 'Next week')

  await week47()
  await waitForEnabled('Previous week')
})

test('adding an entry in the current week does not make an earlier week available', async () => {
  const { user } = await renderPage()
  await week47()
  await openDay(user, 'Monday 16 November')
  await addEntry(user)

  await screen.findByText('1:00 worked')
  expect(button('Previous week')).toBeDisabled()
})

// Slow loads

test('Previous is disabled until the first date is loaded', async () => {
  const loads = holdableFirstDate()
  loads.holding = true
  const { user } = await renderPage({
    contract: weekly,
    entryDates: ['2026-10-29'],
    prepare: loads.prepare,
  })
  await week47()
  await findAddRow()
  expect(button('Previous week')).toBeDisabled()
  expect(button('Next week')).toBeDisabled()

  await loads.release()

  await waitForEnabled('Previous week')
  await week47()
  await click(user, 'Previous week')
  await week46()
})

test('a slow load of the first date keeps the week opened since', async () => {
  const loads = holdableFirstDate()
  const { user } = await renderPage({
    contract: weekly,
    prepare: loads.prepare,
  })
  await week47()
  await waitForEnabled('Previous week')

  loads.holding = true
  await addEntry(user)
  await waitFor(() => expect(loads.held).toBeGreaterThan(0))
  // The limits known so far keep counting.
  expect(button('Previous week')).toBeEnabled()
  await click(user, 'Previous week')
  await week46()
  await loads.release()

  await week46()
  expect(button('Previous week')).toBeEnabled()
  expect(button('Next week')).toBeEnabled()
})

test('a slow load of the first date does not overwrite a later one', async () => {
  const loads = holdableFirstDate()
  const { user } = await renderPage({
    entryDates: ['2026-11-11'],
    prepare: loads.prepare,
  })
  await click(user, 'Previous week')
  await week46()
  await openDay(user, 'Wednesday 11 November')

  loads.holding = true
  await deleteEntry(user)
  await waitFor(() => expect(loads.held).toBeGreaterThan(0))
  loads.holding = false
  await addEntry(user)
  await click(user, 'Next week')
  await week47()
  await waitForEnabled('Previous week')
  await loads.release()

  expect(button('Previous week')).toBeEnabled()
})

// Expected hours of an earlier period (US-05)

test('expected hours can be entered for an earlier week', async () => {
  const { user, contracts, contract } = await renderPage({ contract: weekly })
  const field = () => screen.findByRole('textbox', { name: 'Expected' })

  await click(user, 'Previous week')
  await week46()
  await user.type(await field(), '30')
  await user.tab()

  await waitFor(async () => {
    expect(await contracts.expectedFor(contract!, '2026-11-09')).toBe(30 * 60)
  })
  expect(await contracts.expectedFor(contract!, '2026-11-16')).toBeUndefined()

  await click(user, 'Next week')
  await week47()
  expect(await field()).toHaveValue('')
  await click(user, 'Previous week')
  await week46()
  expect(await field()).toHaveValue('30:00')
})
