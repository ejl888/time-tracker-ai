import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Temporal } from 'temporal-polyfill'
import { expect, test } from 'vitest'
import { fixedClock } from '../domain/clock.ts'
import { createEntryService } from '../domain/entries.ts'
import { createLabelService } from '../domain/labels.ts'
import type { Entry, Label } from '../domain/records.ts'
import { InMemoryRepository } from '../domain/repository.ts'
import { EntriesPage } from './EntriesPage.tsx'

const timeZone = 'Europe/Amsterdam'
// Wednesday 18 November 2026, 12:00 in Amsterdam.
const clock = fixedClock(Temporal.Instant.from('2026-11-18T11:00:00Z'))

interface SeedEntry {
  date: string
  start: string
  end: string
  label: string
  description?: string
}

/**
 * Renders the page on in-memory services, seeded with these labels and
 * entries. Entries refer to their label by name.
 */
async function renderPage(
  seedLabels: { name: string; billable: boolean }[] = [],
  seedEntries: SeedEntry[] = [],
) {
  const entryRepository = new InMemoryRepository<Entry>()
  const labels = createLabelService(
    new InMemoryRepository<Label>(),
    entryRepository,
    clock,
  )
  const entries = createEntryService(entryRepository, clock)
  const ids = new Map<string, string>()
  for (const { name, billable } of seedLabels) {
    const created = await labels.create(name, { billable })
    if (!created.ok) throw new Error(`could not seed label ${name}`)
    ids.set(name, created.value.id)
  }
  for (const seed of seedEntries) {
    const added = await entries.add({
      date: Temporal.PlainDate.from(seed.date),
      start: Temporal.PlainTime.from(seed.start),
      end: Temporal.PlainTime.from(seed.end),
      labelId: ids.get(seed.label) ?? '',
      description: seed.description ?? '',
      timeZone,
    })
    if (!added.ok) throw new Error(`could not seed entry: ${added.error}`)
  }
  render(
    <EntriesPage
      entries={entries}
      labels={labels}
      clock={clock}
      timeZone={timeZone}
    />,
  )
  await screen.findByRole('heading', { name: 'Entries' })
  return { user: userEvent.setup() }
}

/** The entries in the list, in order, as shown in each row. */
function listedEntries() {
  const list = screen.queryByRole('list', { name: 'Entries' })
  if (!list) return []
  return within(list)
    .queryAllByRole('listitem')
    .map((item) => {
      const row = within(item)
      const select = row.getByRole('combobox', {
        name: 'Label',
      }) as HTMLSelectElement
      return {
        start: (row.getByRole('textbox', { name: 'Start' }) as HTMLInputElement)
          .value,
        end: (row.getByRole('textbox', { name: 'End' }) as HTMLInputElement)
          .value,
        label: select.selectedOptions[0]?.textContent ?? '',
        description: (
          row.getByRole('textbox', { name: 'Description' }) as HTMLInputElement
        ).value,
        item,
      }
    })
}

/** Waits until the list shows this many entries and returns them. */
async function findEntries(count: number) {
  await screen.findByRole('list', { name: 'Entries' })
  const found = listedEntries()
  expect(found).toHaveLength(count)
  return found
}

const workLabels = [
  { name: 'Client', billable: true },
  { name: 'Admin', billable: false },
]

test("shows today's date and today's entries in time order", async () => {
  await renderPage(workLabels, [
    {
      date: '2026-11-18',
      start: '13:00',
      end: '14:30',
      label: 'Client',
      description: 'Meeting',
    },
    {
      date: '2026-11-18',
      start: '09:00',
      end: '10:00',
      label: 'Admin',
      description: 'Email',
    },
    { date: '2026-11-17', start: '08:00', end: '09:00', label: 'Client' },
  ])

  expect(
    screen.getByRole('heading', { name: 'Wednesday 18 November 2026' }),
  ).toBeInTheDocument()
  const [first, second] = await findEntries(2)
  expect(first).toMatchObject({
    start: '09:00',
    end: '10:00',
    label: 'Admin',
    description: 'Email',
  })
  expect(within(first.item).getByText('1:00')).toBeInTheDocument()
  expect(second).toMatchObject({
    start: '13:00',
    end: '14:30',
    label: 'Client',
    description: 'Meeting',
  })
  expect(within(second.item).getByText('1:30')).toBeInTheDocument()
  for (const { item } of [first, second]) {
    expect(
      within(item).getByRole('button', { name: 'Delete' }),
    ).toBeInTheDocument()
  }
})

test('shows the worked hours of the day, counting only billable labels', async () => {
  await renderPage(workLabels, [
    { date: '2026-11-18', start: '09:00', end: '10:00', label: 'Client' },
    { date: '2026-11-18', start: '10:00', end: '10:30', label: 'Admin' },
    { date: '2026-11-17', start: '09:00', end: '12:00', label: 'Client' },
  ])

  await findEntries(2)
  expect(screen.getByText('Worked 1:00')).toBeInTheDocument()
})

test('goes to the previous and next day, but not past today', async () => {
  const { user } = await renderPage(workLabels, [
    {
      date: '2026-11-18',
      start: '09:00',
      end: '10:00',
      label: 'Client',
      description: 'Today',
    },
    {
      date: '2026-11-17',
      start: '11:00',
      end: '12:00',
      label: 'Admin',
      description: 'Yesterday',
    },
  ])
  await findEntries(1)
  const next = screen.getByRole('button', { name: 'Next day' })
  expect(next).toBeDisabled()

  await user.click(screen.getByRole('button', { name: 'Previous day' }))

  expect(
    await screen.findByRole('heading', { name: 'Tuesday 17 November 2026' }),
  ).toBeInTheDocument()
  const [yesterday] = await findEntries(1)
  expect(yesterday).toMatchObject({
    start: '11:00',
    end: '12:00',
    label: 'Admin',
    description: 'Yesterday',
  })
  expect(screen.getByText('Worked 0:00')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Next day' })).toBeEnabled()

  await user.click(screen.getByRole('button', { name: 'Next day' }))

  expect(
    await screen.findByRole('heading', { name: 'Wednesday 18 November 2026' }),
  ).toBeInTheDocument()
  expect(await screen.findByDisplayValue('Today')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Next day' })).toBeDisabled()
})

test('returns to today from an earlier day', async () => {
  const { user } = await renderPage(workLabels, [
    {
      date: '2026-11-18',
      start: '09:00',
      end: '10:00',
      label: 'Client',
      description: 'Today',
    },
  ])
  await findEntries(1)

  await user.click(screen.getByRole('button', { name: 'Previous day' }))
  await user.click(screen.getByRole('button', { name: 'Previous day' }))
  expect(
    await screen.findByRole('heading', { name: 'Monday 16 November 2026' }),
  ).toBeInTheDocument()

  await user.click(screen.getByRole('button', { name: 'Today' }))

  expect(
    await screen.findByRole('heading', { name: 'Wednesday 18 November 2026' }),
  ).toBeInTheDocument()
  expect(await screen.findByDisplayValue('Today')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Next day' })).toBeDisabled()
})

test('warns when entries of the day overlap', async () => {
  await renderPage(workLabels, [
    { date: '2026-11-18', start: '09:00', end: '10:30', label: 'Client' },
    { date: '2026-11-18', start: '10:00', end: '11:00', label: 'Admin' },
  ])

  await findEntries(2)
  expect(screen.getByRole('status')).toHaveTextContent('Some entries overlap')
})

test('shows no overlap warning for adjacent entries', async () => {
  await renderPage(workLabels, [
    { date: '2026-11-18', start: '09:00', end: '10:00', label: 'Client' },
    { date: '2026-11-18', start: '10:00', end: '11:00', label: 'Admin' },
  ])

  await findEntries(2)
  expect(screen.queryByText('Some entries overlap')).not.toBeInTheDocument()
})

test('shows "No entries" for a day without entries', async () => {
  await renderPage(workLabels, [
    { date: '2026-11-17', start: '09:00', end: '10:00', label: 'Client' },
  ])

  expect(await screen.findByText('No entries')).toBeInTheDocument()
  expect(listedEntries()).toEqual([])
  expect(screen.getByText('Worked 0:00')).toBeInTheDocument()
})

test('shows an entry ending at midnight as ending at 24:00', async () => {
  await renderPage(workLabels, [
    { date: '2026-11-18', start: '22:00', end: '00:00', label: 'Client' },
  ])

  const [entry] = await findEntries(1)
  expect(entry).toMatchObject({ start: '22:00', end: '24:00' })
  expect(within(entry.item).getByText('2:00')).toBeInTheDocument()
})
