import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Temporal } from 'temporal-polyfill'
import { afterEach, expect, test } from 'vitest'
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

// Going to another period shows the top of the page; other steps keep the scroll position (US-18).

const timeZone = 'Europe/Amsterdam'

const weekly: ContractFields = {
  startDate: '2026-11-02',
  billingCycle: 'week',
  billableLimit: 36 * 60,
  startingBalance: 0,
}

/** Renders the Entries page on in-memory services, on Wed 25 Nov 2026 in week 48, with a contract and the label Client. */
async function renderPage() {
  const clock = fixedClock(
    Temporal.PlainDate.from('2026-11-25')
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
  const saved = await contracts.save(weekly)
  if (!saved.ok) throw new Error(`could not seed contract: ${saved.error}`)
  render(
    <EntriesPage
      entries={entries}
      labels={labels}
      contracts={contracts}
      clock={clock}
      timeZone={timeZone}
    />,
  )
  return { user: userEvent.setup(), contracts, contract: saved.value }
}

/** Scrolls the page down. */
function scrollDown() {
  document.documentElement.scrollTop = 300
}

function scrollTop() {
  return document.documentElement.scrollTop
}

afterEach(() => {
  document.documentElement.scrollTop = 0
})

type User = ReturnType<typeof userEvent.setup>

/** Waits until the page shows this week with its summary, an open day and its filled add row. */
async function waitForWeek(title: string) {
  await screen.findByRole('heading', { level: 2, name: title })
  await screen.findByRole('textbox', { name: 'Expected' })
  await screen.findByRole('heading', { level: 3 })
  const row = within(await screen.findByRole('form', { name: 'Add entry' }))
  await waitFor(() =>
    expect(row.getByRole('textbox', { name: 'Start' })).not.toHaveValue(''),
  )
  return row
}

/** Clicks a button of the bar, once it is enabled. */
async function click(user: User, name: string) {
  const button = screen.getByRole('button', { name })
  await waitFor(() => expect(button).toBeEnabled())
  await user.click(button)
}

test('shows the top when going to the previous week', async () => {
  const { user } = await renderPage()
  await waitForWeek('Week 48')
  scrollDown()

  await click(user, 'Previous week')

  await waitForWeek('Week 47')
  expect(scrollTop()).toBe(0)
})

test('shows the top when going to the next week', async () => {
  const { user } = await renderPage()
  await waitForWeek('Week 48')
  await click(user, 'Previous week')
  await waitForWeek('Week 47')
  scrollDown()

  await click(user, 'Next week')

  await waitForWeek('Week 48')
  expect(scrollTop()).toBe(0)
})

test('shows the top when going to today', async () => {
  const { user } = await renderPage()
  await waitForWeek('Week 48')
  await click(user, 'Previous week')
  await waitForWeek('Week 47')
  scrollDown()

  await click(user, 'Go to today')

  await waitForWeek('Week 48')
  expect(scrollTop()).toBe(0)
})

test('keeps the scroll position when a day is opened', async () => {
  const { user } = await renderPage()
  await waitForWeek('Week 48')
  scrollDown()

  await user.click(
    screen.getByRole('button', { name: 'Open Monday 23 November' }),
  )

  await screen.findByRole('heading', { level: 3, name: /^Monday 23 November / })
  await waitForWeek('Week 48')
  expect(scrollTop()).toBe(300)
})

test('keeps the scroll position when an entry is added', async () => {
  const { user } = await renderPage()
  const row = await waitForWeek('Week 48')
  scrollDown()

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
  expect(scrollTop()).toBe(300)
})

test('keeps the scroll position when the expected hours are saved', async () => {
  const { user, contracts, contract } = await renderPage()
  await waitForWeek('Week 48')
  const field = screen.getByRole('textbox', { name: 'Expected' })
  scrollDown()

  await user.type(field, '32{Enter}')

  await waitFor(() => expect(field).toHaveValue('32:00'))
  expect(await contracts.expectedFor(contract, '2026-11-23')).toBe(32 * 60)
  expect(scrollTop()).toBe(300)
})

test('keeps the scroll position when the page loads', async () => {
  scrollDown()
  await renderPage()

  await waitForWeek('Week 48')
  expect(scrollTop()).toBe(300)
})
