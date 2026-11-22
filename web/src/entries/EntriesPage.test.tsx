import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Temporal } from 'temporal-polyfill'
import { afterEach, expect, test, vi } from 'vitest'
import { fixedClock } from '../domain/clock.ts'
import {
  createEntryService,
  endTimeOf,
  startTimeOf,
} from '../domain/entries.ts'
import { createLabelService } from '../domain/labels.ts'
import type { Entry, Label } from '../domain/records.ts'
import { InMemoryRepository } from '../domain/repository.ts'
import { formatEndTime, formatTime } from '../domain/timeText.ts'
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
 * entries. Entries refer to their label by name. The labels named in
 * `deletedLabels` are deleted after seeding, before the page renders.
 */
async function renderPage(
  seedLabels: { name: string; billable: boolean }[] = [],
  seedEntries: SeedEntry[] = [],
  deletedLabels: string[] = [],
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
  for (const name of deletedLabels) {
    const removed = await labels.remove(ids.get(name) ?? '')
    if (!removed.ok) throw new Error(`could not delete label ${name}`)
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
  return { user: userEvent.setup(), entries, labels, ids }
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

/** Queries inside the add row, whose fields have the same names as a row's. */
function addForm() {
  return within(screen.getByRole('form', { name: 'Add entry' }))
}

interface AddInput {
  start?: string
  end?: string
  label?: string
  description?: string
}

/** Fills in the add row; fields left out stay as they are. */
async function fillAddForm(
  user: ReturnType<typeof userEvent.setup>,
  { start, end, label, description }: AddInput,
) {
  const form = await screen.findByRole('form', { name: 'Add entry' })
  const row = within(form)
  if (start !== undefined) {
    await user.clear(row.getByRole('textbox', { name: 'Start' }))
    await user.type(row.getByRole('textbox', { name: 'Start' }), start)
  }
  if (end !== undefined) {
    await user.clear(row.getByRole('textbox', { name: 'End' }))
    await user.type(row.getByRole('textbox', { name: 'End' }), end)
  }
  if (label !== undefined) {
    await user.selectOptions(
      row.getByRole('combobox', { name: 'Label' }),
      label,
    )
  }
  if (description !== undefined) {
    await user.clear(row.getByRole('textbox', { name: 'Description' }))
    await user.type(
      row.getByRole('textbox', { name: 'Description' }),
      description,
    )
  }
}

/** Fills in the add row and clicks "Add". */
async function addEntry(
  user: ReturnType<typeof userEvent.setup>,
  input: AddInput,
) {
  await fillAddForm(user, input)
  await user.click(addForm().getByRole('button', { name: 'Add' }))
}

test('adds an entry in time order, updates the worked hours and clears the add row', async () => {
  const { user } = await renderPage(workLabels, [
    { date: '2026-11-18', start: '09:00', end: '10:00', label: 'Client' },
    { date: '2026-11-18', start: '15:00', end: '16:00', label: 'Admin' },
  ])
  await findEntries(2)
  expect(screen.getByText('Worked 1:00')).toBeInTheDocument()
  expect(addForm().getByRole('combobox', { name: 'Label' })).toHaveDisplayValue(
    'Pick a label',
  )

  await addEntry(user, {
    start: '13:00',
    end: '14:30',
    label: 'Client',
    description: 'Review',
  })

  expect(await screen.findByText('Worked 2:30')).toBeInTheDocument()
  const found = await findEntries(3)
  expect(found.map(({ start, end }) => `${start}-${end}`)).toEqual([
    '09:00-10:00',
    '13:00-14:30',
    '15:00-16:00',
  ])
  expect(found[1]).toMatchObject({ label: 'Client', description: 'Review' })
  // The add row comes after the list.
  expect(
    screen
      .getByRole('list', { name: 'Entries' })
      .compareDocumentPosition(
        screen.getByRole('form', { name: 'Add entry' }),
      ) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy()
  expect(addForm().getByRole('textbox', { name: 'Start' })).toHaveValue('')
  expect(addForm().getByRole('textbox', { name: 'End' })).toHaveValue('')
  expect(addForm().getByRole('combobox', { name: 'Label' })).toHaveDisplayValue(
    'Pick a label',
  )
  expect(addForm().getByRole('textbox', { name: 'Description' })).toHaveValue(
    '',
  )
  expect(addForm().queryByRole('alert')).not.toBeInTheDocument()
})

test('adds an entry when Enter is pressed in a field', async () => {
  const { user } = await renderPage(workLabels)
  await screen.findByText('No entries')

  await fillAddForm(user, {
    start: '13:00',
    end: '14:30',
    label: 'Client',
    description: 'Review',
  })
  await user.type(
    addForm().getByRole('textbox', { name: 'Description' }),
    '{Enter}',
  )

  const [entry] = await findEntries(1)
  expect(entry).toMatchObject({
    start: '13:00',
    end: '14:30',
    label: 'Client',
    description: 'Review',
  })
})

test('rejects a time that is not HH:MM and keeps the typed text', async () => {
  const { user } = await renderPage(workLabels)
  await screen.findByText('No entries')

  await addEntry(user, { start: '9', end: '10:00', label: 'Client' })

  expect(await addForm().findByRole('alert')).toHaveTextContent(
    'Enter a time as HH:MM',
  )
  expect(addForm().getByRole('textbox', { name: 'Start' })).toHaveValue('9')
  expect(addForm().getByRole('textbox', { name: 'End' })).toHaveValue('10:00')
  expect(screen.getByText('No entries')).toBeInTheDocument()
  expect(listedEntries()).toEqual([])
})

test('rejects an end that is not after the start', async () => {
  const { user } = await renderPage(workLabels)
  await screen.findByText('No entries')

  await addEntry(user, { start: '10:00', end: '09:30', label: 'Client' })

  expect(await addForm().findByRole('alert')).toHaveTextContent(
    "End must be after start; an entry can't run past midnight, so split it",
  )
  expect(screen.getByText('No entries')).toBeInTheDocument()
  expect(listedEntries()).toEqual([])
})

test('rejects an entry without a label', async () => {
  const { user } = await renderPage(workLabels)
  await screen.findByText('No entries')

  await addEntry(user, { start: '09:00', end: '10:00' })

  expect(await addForm().findByRole('alert')).toHaveTextContent('Pick a label')
  expect(screen.getByText('No entries')).toBeInTheDocument()
  expect(listedEntries()).toEqual([])
})

test('accepts 24:00 as the end', async () => {
  const { user } = await renderPage(workLabels)
  await screen.findByText('No entries')

  await addEntry(user, { start: '22:00', end: '24:00', label: 'Client' })

  const [entry] = await findEntries(1)
  expect(entry).toMatchObject({ start: '22:00', end: '24:00' })
  expect(within(entry.item).getByText('2:00')).toBeInTheDocument()
})

test('adds an entry to the day shown', async () => {
  const { user } = await renderPage(workLabels)
  await screen.findByText('No entries')
  await user.click(screen.getByRole('button', { name: 'Previous day' }))
  expect(
    await screen.findByRole('heading', { name: 'Tuesday 17 November 2026' }),
  ).toBeInTheDocument()
  await screen.findByText('No entries')

  await addEntry(user, {
    start: '09:00',
    end: '10:00',
    label: 'Client',
    description: 'Yesterday',
  })

  const [entry] = await findEntries(1)
  expect(entry).toMatchObject({ description: 'Yesterday' })
  await user.click(screen.getByRole('button', { name: 'Next day' }))
  expect(
    await screen.findByRole('heading', { name: 'Wednesday 18 November 2026' }),
  ).toBeInTheDocument()
  expect(await screen.findByText('No entries')).toBeInTheDocument()
})

test('warns when an added entry overlaps another', async () => {
  const { user } = await renderPage(workLabels, [
    { date: '2026-11-18', start: '09:00', end: '10:30', label: 'Client' },
  ])
  await findEntries(1)
  expect(screen.queryByText('Some entries overlap')).not.toBeInTheDocument()

  await addEntry(user, { start: '10:00', end: '11:00', label: 'Admin' })

  expect(await screen.findByRole('status')).toHaveTextContent(
    'Some entries overlap',
  )
  await findEntries(2)
})

test('clears an earlier message after a successful add', async () => {
  const { user } = await renderPage(workLabels)
  await screen.findByText('No entries')
  await addEntry(user, { start: '09:00', end: '10:00' })
  expect(await addForm().findByRole('alert')).toHaveTextContent('Pick a label')

  await addEntry(user, { label: 'Client' })

  await findEntries(1)
  expect(addForm().queryByRole('alert')).not.toBeInTheDocument()
})

afterEach(() => {
  vi.restoreAllMocks()
})

const today = Temporal.PlainDate.from('2026-11-18')

/** The entries of today in the service, as start-end, label id and description. */
async function savedEntries(entries: ReturnType<typeof createEntryService>) {
  return (await entries.on(today)).map((entry) => ({
    time: `${formatTime(startTimeOf(entry))}-${formatEndTime(endTimeOf(entry))}`,
    labelId: entry.labelId,
    description: entry.description,
  }))
}

/** A text field of a listed entry, found within that entry's row. */
function rowField(item: HTMLElement, name: 'Start' | 'End' | 'Description') {
  return within(item).getByRole('textbox', { name })
}

const twoEntries: SeedEntry[] = [
  {
    date: '2026-11-18',
    start: '09:00',
    end: '10:00',
    label: 'Client',
    description: 'Email',
  },
  {
    date: '2026-11-18',
    start: '15:00',
    end: '16:00',
    label: 'Admin',
    description: 'Filing',
  },
]

test("changes an entry's end with Enter and updates its duration and the worked hours", async () => {
  const { user, entries, ids } = await renderPage(workLabels, twoEntries)
  const [first] = await findEntries(2)
  expect(screen.getByText('Worked 1:00')).toBeInTheDocument()
  const end = rowField(first.item, 'End')

  await user.clear(end)
  await user.type(end, '11:15{Enter}')

  expect(await within(first.item).findByText('2:15')).toBeInTheDocument()
  expect(await screen.findByText('Worked 2:15')).toBeInTheDocument()
  expect(rowField(listedEntries()[0].item, 'End')).toHaveValue('11:15')
  expect(await savedEntries(entries)).toEqual([
    { time: '09:00-11:15', labelId: ids.get('Client'), description: 'Email' },
    { time: '15:00-16:00', labelId: ids.get('Admin'), description: 'Filing' },
  ])
})

test("changes an entry's end when leaving the field", async () => {
  const { user, entries } = await renderPage(workLabels, twoEntries)
  const [first] = await findEntries(2)
  const end = rowField(first.item, 'End')

  await user.clear(end)
  await user.type(end, '11:15')
  await user.tab()

  expect(await screen.findByText('Worked 2:15')).toBeInTheDocument()
  await waitFor(async () =>
    expect((await savedEntries(entries))[0].time).toBe('09:00-11:15'),
  )
})

test("changes an entry's description when leaving the field", async () => {
  const { user, entries } = await renderPage(workLabels, twoEntries)
  const [first] = await findEntries(2)
  const description = rowField(first.item, 'Description')

  await user.clear(description)
  await user.type(description, 'Review')
  await user.tab()

  await waitFor(async () =>
    expect((await savedEntries(entries))[0].description).toBe('Review'),
  )
  expect(listedEntries()[0]).toMatchObject({ description: 'Review' })
  expect((await savedEntries(entries))[1].description).toBe('Filing')
})

test('reverts a changed field with Esc and saves nothing', async () => {
  const { user, entries } = await renderPage(workLabels, twoEntries)
  const [first] = await findEntries(2)
  const before = await savedEntries(entries)
  const end = rowField(first.item, 'End')

  await user.clear(end)
  await user.type(end, '11:15')
  expect(end).toHaveValue('11:15')
  await user.keyboard('{Escape}')

  expect(end).toHaveValue('10:00')
  await user.tab()
  expect(end).toHaveValue('10:00')
  expect(screen.getByText('Worked 1:00')).toBeInTheDocument()
  expect(await savedEntries(entries)).toEqual(before)
})

test('rejects a changed time that is not HH:MM in the row and shows the saved time again', async () => {
  const { user, entries } = await renderPage(workLabels, twoEntries)
  const [first, second] = await findEntries(2)
  const before = await savedEntries(entries)
  const end = rowField(first.item, 'End')

  await user.clear(end)
  await user.type(end, '9{Enter}')

  expect(await within(first.item).findByRole('alert')).toHaveTextContent(
    'Enter a time as HH:MM',
  )
  expect(end).toHaveValue('10:00')
  expect(within(second.item).queryByRole('alert')).not.toBeInTheDocument()
  expect(addForm().queryByRole('alert')).not.toBeInTheDocument()
  expect(await savedEntries(entries)).toEqual(before)
})

test('rejects a changed end that is not after the start in the row', async () => {
  const { user, entries } = await renderPage(workLabels, twoEntries)
  const [first] = await findEntries(2)
  const before = await savedEntries(entries)
  const end = rowField(first.item, 'End')

  await user.clear(end)
  await user.type(end, '08:30{Enter}')

  expect(await within(first.item).findByRole('alert')).toHaveTextContent(
    "End must be after start; an entry can't run past midnight, so split it",
  )
  expect(end).toHaveValue('10:00')
  expect(addForm().queryByRole('alert')).not.toBeInTheDocument()
  expect(await savedEntries(entries)).toEqual(before)
})

test('clears the row message after a successful change in that row', async () => {
  const { user } = await renderPage(workLabels, twoEntries)
  const [first] = await findEntries(2)
  const end = rowField(first.item, 'End')
  await user.clear(end)
  await user.type(end, '9{Enter}')
  expect(await within(first.item).findByRole('alert')).toHaveTextContent(
    'Enter a time as HH:MM',
  )

  await user.clear(end)
  await user.type(end, '11:15{Enter}')

  expect(await screen.findByText('Worked 2:15')).toBeInTheDocument()
  await waitFor(() =>
    expect(
      within(listedEntries()[0].item).queryByRole('alert'),
    ).not.toBeInTheDocument(),
  )
})

test("changes an entry's label right away when another one is picked", async () => {
  const { user, entries, ids } = await renderPage(workLabels, twoEntries)
  const [first] = await findEntries(2)
  expect(screen.getByText('Worked 1:00')).toBeInTheDocument()

  await user.selectOptions(
    within(first.item).getByRole('combobox', { name: 'Label' }),
    'Admin',
  )

  expect(await screen.findByText('Worked 0:00')).toBeInTheDocument()
  await waitFor(async () =>
    expect((await savedEntries(entries))[0].labelId).toBe(ids.get('Admin')),
  )
  expect(listedEntries()[0]).toMatchObject({ label: 'Admin' })
})

test('sorts the list again when a changed start moves an entry', async () => {
  const { user } = await renderPage(workLabels, twoEntries)
  const [, second] = await findEntries(2)
  const start = rowField(second.item, 'Start')

  await user.clear(start)
  await user.type(start, '08:00{Enter}')

  await waitFor(() =>
    expect(listedEntries().map(({ start, end }) => `${start}-${end}`)).toEqual([
      '08:00-16:00',
      '09:00-10:00',
    ]),
  )
  expect(listedEntries()[0]).toMatchObject({ description: 'Filing' })
})

/** Clicks Delete in this row, answering the confirmation. */
async function deleteEntry(
  user: ReturnType<typeof userEvent.setup>,
  item: HTMLElement,
  confirmed: boolean,
) {
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(confirmed)
  await user.click(within(item).getByRole('button', { name: 'Delete' }))
  return confirm
}

test('deletes an entry after confirmation', async () => {
  const { user, entries } = await renderPage(workLabels, twoEntries)
  const [first] = await findEntries(2)
  expect(screen.getByText('Worked 1:00')).toBeInTheDocument()

  const confirm = await deleteEntry(user, first.item, true)

  expect(confirm).toHaveBeenCalledWith('Delete this entry?')
  await waitFor(() => expect(listedEntries()).toHaveLength(1))
  expect(listedEntries()[0]).toMatchObject({ description: 'Filing' })
  expect(screen.getByText('Worked 0:00')).toBeInTheDocument()
  expect(
    (await savedEntries(entries)).map(({ description }) => description),
  ).toEqual(['Filing'])
})

test('keeps the entry when the deletion is cancelled', async () => {
  const { user, entries } = await renderPage(workLabels, twoEntries)
  const [first] = await findEntries(2)
  const before = await savedEntries(entries)

  const confirm = await deleteEntry(user, first.item, false)

  expect(confirm).toHaveBeenCalledWith('Delete this entry?')
  expect(listedEntries()).toHaveLength(2)
  expect(screen.getByText('Worked 1:00')).toBeInTheDocument()
  expect(await savedEntries(entries)).toEqual(before)
})

test('shows a deleted label in its entry but does not offer it for new entries', async () => {
  await renderPage(workLabels, twoEntries, ['Admin'])

  const [, second] = await findEntries(2)
  expect(second).toMatchObject({ label: 'Admin (deleted)' })
  const addOptions = within(
    addForm().getByRole('combobox', { name: 'Label' }),
  ).getAllByRole('option')
  expect(addOptions.map((option) => option.textContent)).not.toContain(
    'Admin (deleted)',
  )
  expect(addOptions.map((option) => option.textContent)).not.toContain('Admin')
})

test('shows "(unknown label)" for an entry whose label is not stored', async () => {
  const entryRepository = new InMemoryRepository<Entry>()
  const labels = createLabelService(
    new InMemoryRepository<Label>(),
    entryRepository,
    clock,
  )
  const entries = createEntryService(entryRepository, clock)
  for (const { name, billable } of workLabels) {
    const created = await labels.create(name, { billable })
    if (!created.ok) throw new Error(`could not seed label ${name}`)
  }
  const added = await entries.add({
    date: today,
    start: Temporal.PlainTime.from('09:00'),
    end: Temporal.PlainTime.from('10:00'),
    labelId: 'missing',
    description: 'Orphan',
    timeZone,
  })
  if (!added.ok) throw new Error(`could not seed entry: ${added.error}`)

  render(
    <EntriesPage
      entries={entries}
      labels={labels}
      clock={clock}
      timeZone={timeZone}
    />,
  )

  const [entry] = await findEntries(1)
  expect(entry).toMatchObject({
    label: '(unknown label)',
    description: 'Orphan',
  })
})
