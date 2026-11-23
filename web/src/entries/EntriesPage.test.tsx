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

/**
 * The read-only row of a listed entry: a button whose text starts with the
 * time, like "09:00–10:30". None while that entry's editor is open.
 */
function rowButton(item: HTMLElement) {
  return within(item).queryByRole('button', { name: /^\d\d:\d\d–/ })
}

/**
 * The entries in the list, in order, as shown in each read-only row. The row
 * button holds, in order, the time, the duration, the description ("—" when
 * empty, maybe followed by "· overlaps") and the label chip. An entry whose
 * editor is open has `open: true` and empty texts.
 */
function listedEntries() {
  const list = screen.queryByRole('list', { name: 'Entries' })
  if (!list) return []
  return within(list)
    .queryAllByRole('listitem')
    .map((item) => {
      const button = rowButton(item)
      if (!button) {
        return {
          start: '',
          end: '',
          label: '',
          description: '',
          open: true,
          item,
        }
      }
      const [time = '', , description = '', label = ''] = Array.from(
        button.children,
      ).map((part) => part.textContent ?? '')
      const [start = '', end = ''] = time.split('–')
      const shown = description.replace(/\s*· overlaps$/, '').trim()
      return {
        start,
        end,
        label: label.trim(),
        description: shown === '—' ? '' : shown,
        open: false,
        item,
      }
    })
}

/** Clicks an entry's row and returns queries inside its editor. */
async function openEntry(
  user: ReturnType<typeof userEvent.setup>,
  item: HTMLElement,
) {
  const button = rowButton(item)
  if (!button) throw new Error('the entry has no read-only row to click')
  await user.click(button)
  return within(await within(item).findByRole('form', { name: 'Edit entry' }))
}

/** Whether an entry editor is shown anywhere on the page. */
function editorShown() {
  return screen.queryByRole('form', { name: 'Edit entry' }) !== null
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
  await findEntries(1)
  expect(listedEntries()[0]).toMatchObject({ description: 'Today' })
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
  await findEntries(1)
  expect(listedEntries()[0]).toMatchObject({ description: 'Today' })
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

test('adds an entry in time order, updates the worked hours and prefills the add row', async () => {
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
  expect(addForm().getByRole('textbox', { name: 'Start' })).toHaveValue('16:00')
  expect(addForm().getByRole('textbox', { name: 'End' })).toHaveValue('16:00')
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

test("clicking a row opens the editor with that entry's values and focus on Description", async () => {
  const { user } = await renderPage(workLabels, twoEntries)
  const [first, second] = await findEntries(2)

  const editor = await openEntry(user, first.item)

  expect(editor.getByRole('textbox', { name: 'Start' })).toHaveValue('09:00')
  expect(editor.getByRole('textbox', { name: 'End' })).toHaveValue('10:00')
  expect(editor.getByRole('combobox', { name: 'Label' })).toHaveDisplayValue(
    'Client',
  )
  const description = editor.getByRole('textbox', { name: 'Description' })
  expect(description).toHaveValue('Email')
  expect(description).toHaveFocus()
  for (const name of ['Save', 'Cancel', 'Delete']) {
    expect(editor.getByRole('button', { name })).toBeInTheDocument()
  }
  expect(editor.getByText('Enter saves · Esc cancels')).toBeInTheDocument()
  expect(rowButton(first.item)).not.toBeInTheDocument()
  expect(
    within(second.item).queryByRole('form', { name: 'Edit entry' }),
  ).not.toBeInTheDocument()
  expect(listedEntries()[1]).toMatchObject({
    start: '15:00',
    end: '16:00',
    label: 'Admin',
    description: 'Filing',
    open: false,
  })
})

test('clicking another row closes the first editor and discards its changes', async () => {
  const { user, entries } = await renderPage(workLabels, twoEntries)
  const [first, second] = await findEntries(2)
  const before = await savedEntries(entries)
  const firstEditor = await openEntry(user, first.item)
  const end = firstEditor.getByRole('textbox', { name: 'End' })
  await user.clear(end)
  await user.type(end, '11:15')

  const secondEditor = await openEntry(user, second.item)

  expect(secondEditor.getByRole('textbox', { name: 'Start' })).toHaveValue(
    '15:00',
  )
  expect(screen.getAllByRole('form', { name: 'Edit entry' })).toHaveLength(1)
  expect(listedEntries()[0]).toMatchObject({
    start: '09:00',
    end: '10:00',
    open: false,
  })
  expect(screen.getByText('Worked 1:00')).toBeInTheDocument()
  expect(await savedEntries(entries)).toEqual(before)
})

test('Cancel closes the editor without saving', async () => {
  const { user, entries } = await renderPage(workLabels, twoEntries)
  const [first] = await findEntries(2)
  const before = await savedEntries(entries)
  const editor = await openEntry(user, first.item)
  const description = editor.getByRole('textbox', { name: 'Description' })
  await user.clear(description)
  await user.type(description, 'Review')

  await user.click(editor.getByRole('button', { name: 'Cancel' }))

  expect(editorShown()).toBe(false)
  expect(listedEntries()[0]).toMatchObject({ description: 'Email' })
  expect(await savedEntries(entries)).toEqual(before)
  expect(
    await screen.findByRole('form', { name: 'Add entry' }),
  ).toBeInTheDocument()
})

test("changes an entry's end with Enter and updates its duration and the worked hours", async () => {
  const { user, entries, ids } = await renderPage(workLabels, twoEntries)
  const [first] = await findEntries(2)
  expect(screen.getByText('Worked 1:00')).toBeInTheDocument()
  const editor = await openEntry(user, first.item)
  const end = editor.getByRole('textbox', { name: 'End' })

  await user.clear(end)
  await user.type(end, '11:15{Enter}')

  expect(await within(first.item).findByText('2:15')).toBeInTheDocument()
  expect(await screen.findByText('Worked 2:15')).toBeInTheDocument()
  expect(editorShown()).toBe(false)
  expect(listedEntries()[0]).toMatchObject({ end: '11:15' })
  expect(await savedEntries(entries)).toEqual([
    { time: '09:00-11:15', labelId: ids.get('Client'), description: 'Email' },
    { time: '15:00-16:00', labelId: ids.get('Admin'), description: 'Filing' },
  ])
})

test("changes an entry's end with the Save button", async () => {
  const { user, entries } = await renderPage(workLabels, twoEntries)
  const [first] = await findEntries(2)
  const before = await savedEntries(entries)
  const editor = await openEntry(user, first.item)
  const end = editor.getByRole('textbox', { name: 'End' })

  await user.clear(end)
  await user.type(end, '11:15')
  // Leaving the field no longer saves.
  await user.tab()
  expect(screen.getByText('Worked 1:00')).toBeInTheDocument()
  expect(await savedEntries(entries)).toEqual(before)
  await user.click(editor.getByRole('button', { name: 'Save' }))

  expect(await screen.findByText('Worked 2:15')).toBeInTheDocument()
  await waitFor(async () =>
    expect((await savedEntries(entries))[0].time).toBe('09:00-11:15'),
  )
  expect(editorShown()).toBe(false)
})

test("changes an entry's description with the Save button", async () => {
  const { user, entries } = await renderPage(workLabels, twoEntries)
  const [first] = await findEntries(2)
  const editor = await openEntry(user, first.item)
  const description = editor.getByRole('textbox', { name: 'Description' })

  await user.clear(description)
  await user.type(description, 'Review')
  await user.click(editor.getByRole('button', { name: 'Save' }))

  await waitFor(async () =>
    expect((await savedEntries(entries))[0].description).toBe('Review'),
  )
  await waitFor(() =>
    expect(listedEntries()[0]).toMatchObject({ description: 'Review' }),
  )
  expect((await savedEntries(entries))[1].description).toBe('Filing')
})

test('Esc closes the editor and saves nothing', async () => {
  const { user, entries } = await renderPage(workLabels, twoEntries)
  const [first] = await findEntries(2)
  const before = await savedEntries(entries)
  const editor = await openEntry(user, first.item)
  const end = editor.getByRole('textbox', { name: 'End' })

  await user.clear(end)
  await user.type(end, '11:15')
  expect(end).toHaveValue('11:15')
  await user.keyboard('{Escape}')

  expect(editorShown()).toBe(false)
  expect(listedEntries()[0]).toMatchObject({ end: '10:00' })
  expect(screen.getByText('Worked 1:00')).toBeInTheDocument()
  expect(await savedEntries(entries)).toEqual(before)
  const reopened = await openEntry(user, first.item)
  expect(reopened.getByRole('textbox', { name: 'End' })).toHaveValue('10:00')
})

test('rejects a changed time that is not HH:MM in the editor and keeps the typed text', async () => {
  const { user, entries } = await renderPage(workLabels, twoEntries)
  const [first] = await findEntries(2)
  const before = await savedEntries(entries)
  const editor = await openEntry(user, first.item)
  const end = editor.getByRole('textbox', { name: 'End' })

  await user.clear(end)
  await user.type(end, '9{Enter}')

  expect(await editor.findByRole('alert')).toHaveTextContent(
    'Enter a time as HH:MM',
  )
  expect(editor.getByRole('textbox', { name: 'End' })).toHaveValue('9')
  // The message shows only in this editor.
  expect(screen.getAllByRole('alert')).toHaveLength(1)
  expect(await savedEntries(entries)).toEqual(before)
})

test('rejects a changed end that is not after the start in the editor', async () => {
  const { user, entries } = await renderPage(workLabels, twoEntries)
  const [first] = await findEntries(2)
  const before = await savedEntries(entries)
  const editor = await openEntry(user, first.item)
  const end = editor.getByRole('textbox', { name: 'End' })

  await user.clear(end)
  await user.type(end, '08:30{Enter}')

  expect(await editor.findByRole('alert')).toHaveTextContent(
    "End must be after start; an entry can't run past midnight, so split it",
  )
  expect(editor.getByRole('textbox', { name: 'End' })).toHaveValue('08:30')
  expect(screen.getAllByRole('alert')).toHaveLength(1)
  expect(await savedEntries(entries)).toEqual(before)
})

test('a successful save closes the editor and its message', async () => {
  const { user } = await renderPage(workLabels, twoEntries)
  const [first] = await findEntries(2)
  const editor = await openEntry(user, first.item)
  const end = editor.getByRole('textbox', { name: 'End' })
  await user.clear(end)
  await user.type(end, '9{Enter}')
  expect(await editor.findByRole('alert')).toHaveTextContent(
    'Enter a time as HH:MM',
  )

  await user.clear(end)
  await user.type(end, '11:15{Enter}')

  expect(await screen.findByText('Worked 2:15')).toBeInTheDocument()
  expect(editorShown()).toBe(false)
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})

test('changes the label on Save', async () => {
  const { user, entries, ids } = await renderPage(workLabels, twoEntries)
  const [first] = await findEntries(2)
  expect(screen.getByText('Worked 1:00')).toBeInTheDocument()
  const editor = await openEntry(user, first.item)

  await user.selectOptions(
    editor.getByRole('combobox', { name: 'Label' }),
    'Admin',
  )
  expect(screen.getByText('Worked 1:00')).toBeInTheDocument()
  await user.click(editor.getByRole('button', { name: 'Save' }))

  expect(await screen.findByText('Worked 0:00')).toBeInTheDocument()
  await waitFor(async () =>
    expect((await savedEntries(entries))[0].labelId).toBe(ids.get('Admin')),
  )
  expect(listedEntries()[0]).toMatchObject({ label: 'Admin' })
})

test('sorts the list again when a changed start moves an entry', async () => {
  const { user } = await renderPage(workLabels, twoEntries)
  const [, second] = await findEntries(2)
  const editor = await openEntry(user, second.item)
  const start = editor.getByRole('textbox', { name: 'Start' })

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

/** Opens this entry's editor and deletes it with two clicks on Delete. */
async function deleteEntry(
  user: ReturnType<typeof userEvent.setup>,
  item: HTMLElement,
) {
  const editor = await openEntry(user, item)
  await user.click(editor.getByRole('button', { name: 'Delete' }))
  await user.click(
    editor.getByRole('button', { name: 'Click again to delete' }),
  )
}

test('deletes an entry with two clicks on Delete', async () => {
  const { user, entries } = await renderPage(workLabels, twoEntries)
  const [first] = await findEntries(2)
  expect(screen.getByText('Worked 1:00')).toBeInTheDocument()
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)

  await deleteEntry(user, first.item)

  expect(confirm).not.toHaveBeenCalled()
  await waitFor(() => expect(listedEntries()).toHaveLength(1))
  expect(editorShown()).toBe(false)
  expect(listedEntries()[0]).toMatchObject({ description: 'Filing' })
  expect(screen.getByText('Worked 0:00')).toBeInTheDocument()
  expect(
    (await savedEntries(entries)).map(({ description }) => description),
  ).toEqual(['Filing'])
})

test('keeps the entry after one click on Delete and Esc', async () => {
  const { user, entries } = await renderPage(workLabels, twoEntries)
  const [first] = await findEntries(2)
  const before = await savedEntries(entries)

  const editor = await openEntry(user, first.item)
  await user.click(editor.getByRole('button', { name: 'Delete' }))
  expect(
    editor.getByRole('button', { name: 'Click again to delete' }),
  ).toBeInTheDocument()
  await user.keyboard('{Escape}')

  expect(editorShown()).toBe(false)
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

/** Waits until the add row shows these texts in Start and End. */
async function expectAddTimes(start: string, end: string) {
  await waitFor(() => {
    expect(addForm().getByRole('textbox', { name: 'Start' })).toHaveValue(start)
    expect(addForm().getByRole('textbox', { name: 'End' })).toHaveValue(end)
  })
}

test("prefills the add row with the end of the day's latest entry", async () => {
  await renderPage(workLabels, [
    { date: '2026-11-18', start: '09:00', end: '10:30', label: 'Client' },
  ])
  await findEntries(1)

  await expectAddTimes('10:30', '10:30')
})

test('prefills the add row with 09:00 when there are no entries', async () => {
  await renderPage(workLabels)
  await screen.findByText('No entries')

  await expectAddTimes('09:00', '09:00')
})

test('prefills the add row again after an add and resets its label', async () => {
  const { user } = await renderPage(workLabels, [
    { date: '2026-11-18', start: '09:00', end: '10:30', label: 'Client' },
  ])
  await findEntries(1)
  await expectAddTimes('10:30', '10:30')

  await addEntry(user, { end: '11:15', label: 'Client' })

  const found = await findEntries(2)
  expect(found[1]).toMatchObject({ start: '10:30', end: '11:15' })
  await expectAddTimes('11:15', '11:15')
  expect(addForm().getByRole('combobox', { name: 'Label' })).toHaveDisplayValue(
    'Pick a label',
  )
})

test('opening an entry hides the empty row; closing it shows the prefill again', async () => {
  const { user } = await renderPage(workLabels, [
    { date: '2026-11-18', start: '09:00', end: '10:30', label: 'Client' },
  ])
  const [first] = await findEntries(1)
  await expectAddTimes('10:30', '10:30')
  await fillAddForm(user, { start: '08:00' })

  let editor = await openEntry(user, first.item)

  expect(
    screen.queryByRole('form', { name: 'Add entry' }),
  ).not.toBeInTheDocument()
  await user.click(editor.getByRole('button', { name: 'Cancel' }))
  await expectAddTimes('10:30', '10:30')

  editor = await openEntry(user, first.item)
  const end = editor.getByRole('textbox', { name: 'End' })
  await user.clear(end)
  await user.type(end, '12:00{Enter}')

  expect(await screen.findByText('Worked 3:00')).toBeInTheDocument()
  await expectAddTimes('12:00', '12:00')
})

test('leaves the add row empty on a day whose latest entry ends at 24:00', async () => {
  await renderPage(workLabels, [
    { date: '2026-11-18', start: '22:00', end: '00:00', label: 'Client' },
  ])
  await findEntries(1)

  await expectAddTimes('', '')
})

test('prefills the add row for the day shown after going to the previous day', async () => {
  const { user } = await renderPage(workLabels, [
    { date: '2026-11-17', start: '08:00', end: '09:00', label: 'Client' },
  ])
  await screen.findByText('No entries')
  // Today has no entries, so it takes the earliest start of the day before.
  await expectAddTimes('08:00', '08:00')

  await user.click(screen.getByRole('button', { name: 'Previous day' }))
  expect(
    await screen.findByRole('heading', { name: 'Tuesday 17 November 2026' }),
  ).toBeInTheDocument()
  await findEntries(1)

  await expectAddTimes('09:00', '09:00')
})

test('leaves the end empty when the prefilled start is 00:00', async () => {
  const { user } = await renderPage(workLabels, [
    { date: '2026-11-17', start: '00:00', end: '08:00', label: 'Client' },
  ])
  await screen.findByText('No entries')
  // Today has no entries, so it takes the earliest start of the day before.
  await expectAddTimes('00:00', '')

  await addEntry(user, { label: 'Client' })

  expect(await addForm().findByRole('alert')).toHaveTextContent(
    'Enter a time as HH:MM',
  )
  expect(screen.getByText('No entries')).toBeInTheDocument()
  expect(listedEntries()).toEqual([])
})

test('after an add the next empty row shows the next prefill with focus on End', async () => {
  const { user } = await renderPage(workLabels, [
    { date: '2026-11-18', start: '09:00', end: '10:30', label: 'Client' },
  ])
  await findEntries(1)
  await expectAddTimes('10:30', '10:30')

  await fillAddForm(user, {
    end: '11:15',
    label: 'Client',
    description: 'Review',
  })
  await user.type(
    addForm().getByRole('textbox', { name: 'Description' }),
    '{Enter}',
  )

  await findEntries(2)
  await expectAddTimes('11:15', '11:15')
  expect(addForm().getByRole('textbox', { name: 'Description' })).toHaveValue(
    '',
  )
  await waitFor(() => {
    expect(addForm().getByRole('textbox', { name: 'End' })).toHaveFocus()
  })
})

test('puts focus on End after an add with the Add button', async () => {
  const { user } = await renderPage(workLabels)
  await screen.findByText('No entries')

  await addEntry(user, { start: '09:00', end: '10:00', label: 'Client' })

  await findEntries(1)
  await expectAddTimes('10:00', '10:00')
  await waitFor(() => {
    expect(addForm().getByRole('textbox', { name: 'End' })).toHaveFocus()
  })
})

test('moves an untouched End along when Start changes, keeping the prefilled duration', async () => {
  const { user } = await renderPage(workLabels, [
    { date: '2026-11-18', start: '09:00', end: '10:30', label: 'Client' },
  ])
  await findEntries(1)
  await expectAddTimes('10:30', '10:30')

  await fillAddForm(user, { start: '11:00' })
  await expectAddTimes('11:00', '11:00')

  await fillAddForm(user, { start: '08:45' })
  await expectAddTimes('08:45', '08:45')
})

test('stops moving End along with Start once End was changed', async () => {
  const { user } = await renderPage(workLabels, [
    { date: '2026-11-18', start: '09:00', end: '10:30', label: 'Client' },
  ])
  await findEntries(1)
  await expectAddTimes('10:30', '10:30')

  await fillAddForm(user, { end: '12:00' })
  await fillAddForm(user, { start: '11:00' })

  await expectAddTimes('11:00', '12:00')
})

test('keeps an empty prefilled End empty when Start changes', async () => {
  const { user } = await renderPage(workLabels, [
    { date: '2026-11-17', start: '00:00', end: '08:00', label: 'Client' },
  ])
  await screen.findByText('No entries')
  // Today has no entries, so it takes the earliest start of the day before.
  await expectAddTimes('00:00', '')

  await fillAddForm(user, { start: '08:00' })

  await expectAddTimes('08:00', '')
})

/** Types in every field of the add row, so a reset is visible in each. */
async function typeInEveryAddField(user: ReturnType<typeof userEvent.setup>) {
  await fillAddForm(user, {
    start: '11:00',
    end: '12:00',
    label: 'Client',
    description: 'Draft',
  })
  await expectAddTimes('11:00', '12:00')
}

/** Checks that the add row shows its prefill again: these times, no label, no description, no message. */
async function expectAddRowReset(start: string, end: string) {
  await expectAddTimes(start, end)
  expect(addForm().getByRole('combobox', { name: 'Label' })).toHaveDisplayValue(
    'Pick a label',
  )
  expect(addForm().getByRole('textbox', { name: 'Description' })).toHaveValue(
    '',
  )
  expect(addForm().queryByRole('alert')).not.toBeInTheDocument()
}

test('Cancel resets the add row to its prefill and adds nothing', async () => {
  const { user } = await renderPage(workLabels, [
    { date: '2026-11-18', start: '09:00', end: '10:30', label: 'Client' },
  ])
  await findEntries(1)
  await expectAddTimes('10:30', '10:30')
  await typeInEveryAddField(user)

  await user.click(addForm().getByRole('button', { name: 'Cancel' }))

  await expectAddRowReset('10:30', '10:30')
  expect(listedEntries()).toHaveLength(1)
  expect(screen.getByText('Worked 1:30')).toBeInTheDocument()
})

test('Esc resets the add row to its prefill and adds nothing', async () => {
  const { user } = await renderPage(workLabels, [
    { date: '2026-11-18', start: '09:00', end: '10:30', label: 'Client' },
  ])
  await findEntries(1)
  await expectAddTimes('10:30', '10:30')
  await typeInEveryAddField(user)

  await user.keyboard('{Escape}')

  await expectAddRowReset('10:30', '10:30')
  expect(listedEntries()).toHaveLength(1)
  expect(screen.getByText('Worked 1:30')).toBeInTheDocument()
})

test('Cancel clears a message in the add row', async () => {
  const { user } = await renderPage(workLabels)
  await screen.findByText('No entries')
  await addEntry(user, { start: '09:00', end: '10:00' })
  expect(await addForm().findByRole('alert')).toHaveTextContent('Pick a label')

  await user.click(addForm().getByRole('button', { name: 'Cancel' }))

  await expectAddRowReset('09:00', '09:00')
})

test('after a reset, End moves along with Start again', async () => {
  const { user } = await renderPage(workLabels, [
    { date: '2026-11-18', start: '09:00', end: '10:30', label: 'Client' },
  ])
  await findEntries(1)
  await expectAddTimes('10:30', '10:30')
  await fillAddForm(user, { end: '12:00' })
  await user.keyboard('{Escape}')
  await expectAddTimes('10:30', '10:30')

  await fillAddForm(user, { start: '11:00' })

  await expectAddTimes('11:00', '11:00')
})

test('shows the keys hint in the add row', async () => {
  await renderPage(workLabels)
  await screen.findByText('No entries')

  expect(addForm().getByText('Enter saves · Esc cancels')).toBeInTheDocument()
})

test('stops moving End along with Start once End was cleared by hand', async () => {
  const { user } = await renderPage(workLabels, [
    { date: '2026-11-18', start: '09:00', end: '10:30', label: 'Client' },
  ])
  await findEntries(1)
  await expectAddTimes('10:30', '10:30')

  await user.clear(addForm().getByRole('textbox', { name: 'End' }))
  await fillAddForm(user, { start: '11:00' })

  await expectAddTimes('11:00', '')
})

// Help texts and messages while editing, as in the prototype's editor. Help
// texts are linked to their field (aria-describedby): where the prefill comes
// from for Start, the duration for End and billable or not for Label.
// Messages (end before start, overlaps) show below the fields instead.

/** The live end-after-start message. */
const endNotAfterStart = /^End must be after start/

/**
 * Renders the page like `renderPage`, plus entries today whose label is not
 * stored.
 */
async function renderWithUnknownLabel(
  seedEntries: SeedEntry[],
  orphans: { start: string; end: string; description?: string }[],
) {
  const entryRepository = new InMemoryRepository<Entry>()
  const labels = createLabelService(
    new InMemoryRepository<Label>(),
    entryRepository,
    clock,
  )
  const entries = createEntryService(entryRepository, clock)
  const ids = new Map<string, string>()
  for (const { name, billable } of workLabels) {
    const created = await labels.create(name, { billable })
    if (!created.ok) throw new Error(`could not seed label ${name}`)
    ids.set(name, created.value.id)
  }
  const seeds = [
    ...seedEntries.map((seed) => ({
      ...seed,
      date: Temporal.PlainDate.from(seed.date),
      labelId: ids.get(seed.label) ?? '',
    })),
    ...orphans.map((orphan) => ({
      ...orphan,
      date: today,
      labelId: 'missing',
    })),
  ]
  for (const seed of seeds) {
    const added = await entries.add({
      date: seed.date,
      start: Temporal.PlainTime.from(seed.start),
      end: Temporal.PlainTime.from(seed.end),
      labelId: seed.labelId,
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

test('shows "End must be after start" in the add row as soon as End is changed to before Start', async () => {
  const { user } = await renderPage(workLabels, [
    { date: '2026-11-18', start: '09:00', end: '10:30', label: 'Client' },
  ])
  await findEntries(1)
  await expectAddTimes('10:30', '10:30')

  await fillAddForm(user, { end: '10:00' })

  expect(addForm().getByText(endNotAfterStart)).toBeInTheDocument()
  // A message below the fields, not help text of End.
  expect(
    addForm().getByRole('textbox', { name: 'End' }),
  ).not.toHaveAccessibleDescription(endNotAfterStart)
  expect(listedEntries()).toHaveLength(1)

  await fillAddForm(user, { end: '11:00' })

  expect(addForm().queryByText(endNotAfterStart)).not.toBeInTheDocument()
})

test('shows "End must be after start" in the add row when End is changed to equal Start', async () => {
  const { user } = await renderPage(workLabels, [
    { date: '2026-11-18', start: '09:00', end: '10:30', label: 'Client' },
  ])
  await findEntries(1)
  await expectAddTimes('10:30', '10:30')

  await fillAddForm(user, { end: '10:30' })

  expect(addForm().getByText(endNotAfterStart)).toBeInTheDocument()
})

test('shows "End must be after start" in the add row when Start is moved past a changed End', async () => {
  const { user } = await renderPage(workLabels, [
    { date: '2026-11-18', start: '09:00', end: '10:30', label: 'Client' },
  ])
  await findEntries(1)
  await expectAddTimes('10:30', '10:30')
  await fillAddForm(user, { end: '11:00' })
  expect(addForm().queryByText(endNotAfterStart)).not.toBeInTheDocument()

  await fillAddForm(user, { start: '11:30' })

  expect(addForm().getByText(endNotAfterStart)).toBeInTheDocument()
})

test('shows no "End must be after start" in the add row before End is changed', async () => {
  const { user } = await renderPage(workLabels, [
    { date: '2026-11-18', start: '09:00', end: '10:30', label: 'Client' },
  ])
  await findEntries(1)
  await expectAddTimes('10:30', '10:30')
  expect(addForm().queryByText(endNotAfterStart)).not.toBeInTheDocument()

  await fillAddForm(user, { start: '11:00' })

  await expectAddTimes('11:00', '11:00')
  expect(addForm().queryByText(endNotAfterStart)).not.toBeInTheDocument()
})

test('shows "End must be after start" in the editor as soon as End is changed to before Start', async () => {
  const { user, entries } = await renderPage(workLabels, twoEntries)
  const [first] = await findEntries(2)
  const before = await savedEntries(entries)
  const editor = await openEntry(user, first.item)
  expect(editor.queryByText(endNotAfterStart)).not.toBeInTheDocument()
  const end = editor.getByRole('textbox', { name: 'End' })

  await user.clear(end)
  await user.type(end, '08:30')

  expect(editor.getByText(endNotAfterStart)).toBeInTheDocument()
  expect(await savedEntries(entries)).toEqual(before)

  await user.clear(end)
  await user.type(end, '10:30')

  expect(editor.queryByText(endNotAfterStart)).not.toBeInTheDocument()
})

test('shows "End must be after start" in the editor as soon as Start is moved past End', async () => {
  const { user, entries } = await renderPage(workLabels, twoEntries)
  const [first] = await findEntries(2)
  const before = await savedEntries(entries)
  const editor = await openEntry(user, first.item)
  const start = editor.getByRole('textbox', { name: 'Start' })

  // End of an existing entry counts as changed from the start.
  await user.clear(start)
  await user.type(start, '10:30')

  expect(editor.getByRole('textbox', { name: 'End' })).toHaveValue('10:00')
  expect(editor.getByText(endNotAfterStart)).toBeInTheDocument()
  expect(await savedEntries(entries)).toEqual(before)
})

test('shows the duration as help of End in the add row once End is after Start', async () => {
  const { user } = await renderPage(workLabels, [
    { date: '2026-11-18', start: '09:00', end: '10:30', label: 'Client' },
  ])
  await findEntries(1)
  await expectAddTimes('10:30', '10:30')
  const end = addForm().getByRole('textbox', { name: 'End' })
  expect(end).not.toHaveAccessibleDescription(/Duration/)

  await fillAddForm(user, { end: '12:00' })

  expect(end).toHaveAccessibleDescription('Duration 1:30')

  await fillAddForm(user, { end: '12' })

  expect(end).not.toHaveAccessibleDescription(/Duration/)
})

test('shows the duration to midnight when End is 24:00', async () => {
  const { user } = await renderPage(workLabels)
  await screen.findByText('No entries')

  await fillAddForm(user, { start: '22:30', end: '24:00' })

  expect(
    addForm().getByRole('textbox', { name: 'End' }),
  ).toHaveAccessibleDescription('Duration 1:30')
})

test("shows the entry's duration as help of End in the editor and updates it", async () => {
  const { user } = await renderPage(workLabels, [
    ...twoEntries,
    { date: '2026-11-18', start: '22:00', end: '00:00', label: 'Client' },
  ])
  const [first, , last] = await findEntries(3)

  let editor = await openEntry(user, first.item)
  let end = editor.getByRole('textbox', { name: 'End' })
  expect(end).toHaveAccessibleDescription('Duration 1:00')

  await user.clear(end)
  await user.type(end, '10:45')

  expect(end).toHaveAccessibleDescription('Duration 1:45')

  editor = await openEntry(user, last.item)
  end = editor.getByRole('textbox', { name: 'End' })
  expect(end).toHaveAccessibleDescription('Duration 2:00')
})

test('shows "From previous entry" as help of Start when the add row starts at the previous end', async () => {
  await renderPage(workLabels, [
    { date: '2026-11-18', start: '09:00', end: '10:30', label: 'Client' },
  ])
  await findEntries(1)
  await expectAddTimes('10:30', '10:30')

  expect(
    addForm().getByRole('textbox', { name: 'Start' }),
  ).toHaveAccessibleDescription('From previous entry')
})

test('shows "Same as" and the date as help of Start when the add row takes the start of an earlier day', async () => {
  await renderPage(workLabels, [
    { date: '2026-11-11', start: '08:15', end: '09:00', label: 'Client' },
    { date: '2026-11-17', start: '08:45', end: '09:00', label: 'Client' },
  ])
  await screen.findByText('No entries')
  await expectAddTimes('08:15', '08:15')

  expect(
    addForm().getByRole('textbox', { name: 'Start' }),
  ).toHaveAccessibleDescription('Same as Wed 11 Nov')
})

test('shows "Same as" the most recent earlier day when a week ago has no entries', async () => {
  await renderPage(workLabels, [
    { date: '2026-11-17', start: '08:45', end: '09:00', label: 'Client' },
  ])
  await screen.findByText('No entries')
  await expectAddTimes('08:45', '08:45')

  expect(
    addForm().getByRole('textbox', { name: 'Start' }),
  ).toHaveAccessibleDescription('Same as Tue 17 Nov')
})

test('shows "Default start" as help of Start when there is nothing to take the start from', async () => {
  await renderPage(workLabels)
  await screen.findByText('No entries')
  await expectAddTimes('09:00', '09:00')

  expect(
    addForm().getByRole('textbox', { name: 'Start' }),
  ).toHaveAccessibleDescription('Default start')
})

test('hides where the start comes from once Start is changed, and shows it again after Cancel', async () => {
  const { user } = await renderPage(workLabels, [
    { date: '2026-11-18', start: '09:00', end: '10:30', label: 'Client' },
  ])
  await findEntries(1)
  await expectAddTimes('10:30', '10:30')
  const start = () => addForm().getByRole('textbox', { name: 'Start' })
  expect(start()).toHaveAccessibleDescription('From previous entry')

  await fillAddForm(user, { start: '11:00' })

  expect(start()).not.toHaveAccessibleDescription(/From previous entry/)
  expect(addForm().queryByText('From previous entry')).not.toBeInTheDocument()

  await user.click(addForm().getByRole('button', { name: 'Cancel' }))

  await expectAddTimes('10:30', '10:30')
  expect(start()).toHaveAccessibleDescription('From previous entry')
})

test('shows "From previous entry" in the next empty row after an add', async () => {
  const { user } = await renderPage(workLabels)
  await screen.findByText('No entries')
  const start = () => addForm().getByRole('textbox', { name: 'Start' })
  expect(start()).toHaveAccessibleDescription('Default start')

  await addEntry(user, { start: '09:00', end: '10:00', label: 'Client' })

  await findEntries(1)
  await expectAddTimes('10:00', '10:00')
  expect(start()).toHaveAccessibleDescription('From previous entry')
})

test('shows no prefill source in the editor of an existing entry', async () => {
  const { user } = await renderPage(workLabels, twoEntries)
  const [, second] = await findEntries(2)
  // The empty row shows its source until an entry is opened.
  expect(
    addForm().getByRole('textbox', { name: 'Start' }),
  ).toHaveAccessibleDescription('From previous entry')

  const editor = await openEntry(user, second.item)

  expect(
    editor.getByRole('textbox', { name: 'Start' }),
  ).not.toHaveAccessibleDescription(/previous entry|Same as|Default start/)
  expect(editor.queryByText('From previous entry')).not.toBeInTheDocument()
  expect(editor.queryByText(/^Same as/)).not.toBeInTheDocument()
  expect(editor.queryByText('Default start')).not.toBeInTheDocument()
})

test('shows as help of Label whether the picked label is billable', async () => {
  const { user } = await renderPage(workLabels)
  await screen.findByText('No entries')
  const label = addForm().getByRole('combobox', { name: 'Label' })
  expect(label).not.toHaveAccessibleDescription(/billable/i)

  await fillAddForm(user, { label: 'Client' })

  expect(label).toHaveAccessibleDescription('Billable')

  await fillAddForm(user, { label: 'Admin' })

  expect(label).toHaveAccessibleDescription('Non-billable')

  await fillAddForm(user, { label: 'Pick a label' })

  expect(label).not.toHaveAccessibleDescription(/billable/i)
})

test("shows as help of Label in the editor whether the entry's label is billable", async () => {
  const { user } = await renderPage(workLabels, twoEntries)
  const [first] = await findEntries(2)

  const editor = await openEntry(user, first.item)
  const label = editor.getByRole('combobox', { name: 'Label' })

  expect(label).toHaveAccessibleDescription('Billable')

  await user.selectOptions(label, 'Admin')

  expect(label).toHaveAccessibleDescription('Non-billable')
})

test("shows a deleted label's own billable setting in the editor", async () => {
  const { user } = await renderPage(workLabels, twoEntries, ['Client', 'Admin'])
  const [first, second] = await findEntries(2)

  let editor = await openEntry(user, first.item)
  expect(
    editor.getByRole('combobox', { name: 'Label' }),
  ).toHaveAccessibleDescription('Billable')

  editor = await openEntry(user, second.item)
  expect(
    editor.getByRole('combobox', { name: 'Label' }),
  ).toHaveAccessibleDescription('Non-billable')
})

test('shows no billable help in the editor for a label that is not stored', async () => {
  const { user } = await renderWithUnknownLabel(
    [],
    [{ start: '09:00', end: '10:00', description: 'Orphan' }],
  )
  const [entry] = await findEntries(1)

  const editor = await openEntry(user, entry.item)

  expect(
    editor.getByRole('combobox', { name: 'Label' }),
  ).not.toHaveAccessibleDescription(/billable/i)
  expect(editor.queryByText('Billable')).not.toBeInTheDocument()
  expect(editor.queryByText('Non-billable')).not.toBeInTheDocument()
})

const standup: SeedEntry = {
  date: '2026-11-18',
  start: '10:00',
  end: '11:00',
  label: 'Client',
  description: 'Standup',
}

test('warns in the add row which entry the new one overlaps, and still adds it', async () => {
  const { user } = await renderPage(workLabels, [standup])
  await findEntries(1)
  await expectAddTimes('11:00', '11:00')
  expect(addForm().queryByText(/^Overlaps with/)).not.toBeInTheDocument()

  await fillAddForm(user, { start: '09:30', end: '10:30', label: 'Admin' })

  expect(
    addForm().getByText(
      'Overlaps with “Standup” 10:00–11:00. You can still save.',
    ),
  ).toBeInTheDocument()
  // A warning, not an error, and not help text of a field.
  expect(addForm().queryByRole('alert')).not.toBeInTheDocument()
  expect(
    addForm().getByRole('textbox', { name: 'End' }),
  ).not.toHaveAccessibleDescription(/Overlaps with/)

  await user.click(addForm().getByRole('button', { name: 'Add' }))

  const [added] = await findEntries(2)
  expect(added).toMatchObject({ start: '09:30', end: '10:30', label: 'Admin' })
  expect(addForm().queryByText(/^Overlaps with/)).not.toBeInTheDocument()
})

test('does not warn in the add row for an entry that only touches another', async () => {
  const { user } = await renderPage(workLabels, [standup])
  await findEntries(1)
  await expectAddTimes('11:00', '11:00')

  await fillAddForm(user, { end: '12:00' })

  expect(
    addForm().getByRole('textbox', { name: 'End' }),
  ).toHaveAccessibleDescription('Duration 1:00')
  expect(addForm().queryByText(/^Overlaps with/)).not.toBeInTheDocument()
})

test('warns in the editor which entry a changed time overlaps, and still saves it', async () => {
  const { user, entries, ids } = await renderPage(workLabels, [
    {
      date: '2026-11-18',
      start: '09:00',
      end: '10:00',
      label: 'Client',
      description: 'Email',
    },
    standup,
  ])
  const [first] = await findEntries(2)
  const editor = await openEntry(user, first.item)
  expect(editor.queryByText(/^Overlaps with/)).not.toBeInTheDocument()
  const end = editor.getByRole('textbox', { name: 'End' })

  await user.clear(end)
  await user.type(end, '10:30')

  expect(
    editor.getByText(
      'Overlaps with “Standup” 10:00–11:00. You can still save.',
    ),
  ).toBeInTheDocument()
  expect(editor.queryByRole('alert')).not.toBeInTheDocument()

  await user.click(editor.getByRole('button', { name: 'Save' }))

  await waitFor(() => {
    expect(editorShown()).toBe(false)
  })
  expect(await savedEntries(entries)).toEqual([
    {
      time: '09:00-10:30',
      labelId: ids.get('Client'),
      description: 'Email',
    },
    {
      time: '10:00-11:00',
      labelId: ids.get('Client'),
      description: 'Standup',
    },
  ])
})

test('the entry being edited does not overlap itself', async () => {
  const { user } = await renderPage(workLabels, [standup])
  const [first] = await findEntries(1)
  const editor = await openEntry(user, first.item)
  const end = editor.getByRole('textbox', { name: 'End' })

  await user.clear(end)
  await user.type(end, '11:30')

  expect(end).toHaveAccessibleDescription('Duration 1:30')
  expect(editor.queryByText(/^Overlaps with/)).not.toBeInTheDocument()
})

test('shows the overlap warning when an entry that already overlaps is opened', async () => {
  const { user } = await renderPage(workLabels, [
    {
      date: '2026-11-18',
      start: '09:00',
      end: '10:30',
      label: 'Admin',
      description: 'Email',
    },
    standup,
  ])
  const [, second] = await findEntries(2)

  const editor = await openEntry(user, second.item)

  expect(
    editor.getByText('Overlaps with “Email” 09:00–10:30. You can still save.'),
  ).toBeInTheDocument()
})

test('names every overlapped entry in one warning, by start, by label when it has no description', async () => {
  const { user } = await renderPage(workLabels, [
    { date: '2026-11-18', start: '09:00', end: '10:00', label: 'Admin' },
    standup,
  ])
  await findEntries(2)
  await expectAddTimes('11:00', '11:00')

  await fillAddForm(user, { start: '09:30', end: '10:30' })

  expect(
    addForm().getByText(
      'Overlaps with “Admin” 09:00–10:00, “Standup” 10:00–11:00. You can still save.',
    ),
  ).toBeInTheDocument()
})

test('names an overlapped entry without description and with a label that is not stored "(unknown label)"', async () => {
  const { user } = await renderWithUnknownLabel(
    [],
    [{ start: '10:00', end: '11:00' }],
  )
  await findEntries(1)
  await expectAddTimes('11:00', '11:00')

  await fillAddForm(user, { start: '09:30', end: '10:30' })

  expect(
    addForm().getByText(
      'Overlaps with “(unknown label)” 10:00–11:00. You can still save.',
    ),
  ).toBeInTheDocument()
})

test('shows an overlapped entry ending at midnight as ending at 24:00 in the warning', async () => {
  const { user } = await renderPage(workLabels, [
    {
      date: '2026-11-18',
      start: '22:00',
      end: '00:00',
      label: 'Client',
      description: 'Late',
    },
  ])
  await findEntries(1)
  await expectAddTimes('', '')

  await fillAddForm(user, { start: '23:00', end: '24:00' })

  expect(
    addForm().getByText(
      'Overlaps with “Late” 22:00–24:00. You can still save.',
    ),
  ).toBeInTheDocument()
})

// Durations are real time worked, also on the nights the clocks change in
// Europe/Amsterdam (specs/clock-changes.feature).

/**
 * Renders the page like `renderPage`, but with today at noon in Amsterdam on
 * this date, so the page opens on that day.
 */
async function renderOnDay(date: string, seedEntries: SeedEntry[] = []) {
  const dayClock = fixedClock(
    Temporal.PlainDate.from(date)
      .toZonedDateTime({ timeZone, plainTime: '12:00' })
      .toInstant(),
  )
  const entryRepository = new InMemoryRepository<Entry>()
  const labels = createLabelService(
    new InMemoryRepository<Label>(),
    entryRepository,
    dayClock,
  )
  const entries = createEntryService(entryRepository, dayClock)
  const ids = new Map<string, string>()
  for (const { name, billable } of workLabels) {
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
      clock={dayClock}
      timeZone={timeZone}
    />,
  )
  await screen.findByRole('heading', { name: 'Entries' })
  return { user: userEvent.setup() }
}

test('shows the real duration in the editor on the night the clocks go forward', async () => {
  const { user } = await renderOnDay('2026-03-29', [
    { date: '2026-03-29', start: '01:00', end: '04:00', label: 'Client' },
  ])
  expect(
    screen.getByRole('heading', { name: 'Sunday 29 March 2026' }),
  ).toBeInTheDocument()
  const [entry] = await findEntries(1)
  expect(within(entry.item).getByText('2:00')).toBeInTheDocument()

  const editor = await openEntry(user, entry.item)

  expect(
    editor.getByRole('textbox', { name: 'End' }),
  ).toHaveAccessibleDescription('Duration 2:00')
})

test('shows the real duration in the editor on the night the clocks go back', async () => {
  const { user } = await renderOnDay('2026-10-25', [
    { date: '2026-10-25', start: '01:00', end: '04:00', label: 'Client' },
  ])
  expect(
    screen.getByRole('heading', { name: 'Sunday 25 October 2026' }),
  ).toBeInTheDocument()
  const [entry] = await findEntries(1)
  expect(within(entry.item).getByText('4:00')).toBeInTheDocument()

  const editor = await openEntry(user, entry.item)

  expect(
    editor.getByRole('textbox', { name: 'End' }),
  ).toHaveAccessibleDescription('Duration 4:00')
})

test('shows the real duration in the add row on the night the clocks go forward', async () => {
  const { user } = await renderOnDay('2026-03-29')
  await screen.findByText('No entries')

  await fillAddForm(user, { start: '01:00', end: '04:00' })

  expect(
    addForm().getByRole('textbox', { name: 'End' }),
  ).toHaveAccessibleDescription('Duration 2:00')
})

test('shows the real duration in the add row on the night the clocks go back', async () => {
  const { user } = await renderOnDay('2026-10-25')
  await screen.findByText('No entries')

  await fillAddForm(user, { start: '01:00', end: '04:00' })

  expect(
    addForm().getByRole('textbox', { name: 'End' }),
  ).toHaveAccessibleDescription('Duration 4:00')
})

/** The read-only row button of the listed entry with this description. */
function rowOf(description: string) {
  const found = listedEntries().find(
    (entry) => entry.description === description,
  )
  if (!found) throw new Error(`no listed entry "${description}"`)
  const button = rowButton(found.item)
  if (!button) throw new Error(`the entry "${description}" has no row`)
  return button
}

test('flags overlapping rows with "· overlaps", but not touching or separate ones', async () => {
  await renderPage(workLabels, [
    {
      date: '2026-11-18',
      start: '09:00',
      end: '10:30',
      label: 'Client',
      description: 'First',
    },
    {
      date: '2026-11-18',
      start: '10:00',
      end: '11:00',
      label: 'Admin',
      description: 'Second',
    },
    {
      date: '2026-11-18',
      start: '11:00',
      end: '12:00',
      label: 'Client',
      description: 'Touching',
    },
    {
      date: '2026-11-18',
      start: '14:00',
      end: '15:00',
      label: 'Admin',
      description: 'Separate',
    },
  ])
  await findEntries(4)

  expect(rowOf('First')).toHaveTextContent('· overlaps')
  expect(rowOf('Second')).toHaveTextContent('· overlaps')
  expect(rowOf('Touching')).not.toHaveTextContent('overlaps')
  expect(rowOf('Separate')).not.toHaveTextContent('overlaps')
})

test('shows "—" in the row of an entry without description', async () => {
  await renderPage(workLabels, [
    { date: '2026-11-18', start: '09:00', end: '10:00', label: 'Client' },
  ])

  const [entry] = await findEntries(1)
  const button = rowButton(entry.item)
  expect(button).not.toBeNull()
  expect(within(button as HTMLElement).getByText('—')).toBeInTheDocument()
})

test('going to another day closes an open editor and shows the empty row of that day', async () => {
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
  let [entry] = await findEntries(1)
  await openEntry(user, entry.item)

  await user.click(screen.getByRole('button', { name: 'Previous day' }))

  expect(
    await screen.findByRole('heading', { name: 'Tuesday 17 November 2026' }),
  ).toBeInTheDocument()
  entry = (await findEntries(1))[0]
  expect(entry).toMatchObject({ description: 'Yesterday', open: false })
  expect(editorShown()).toBe(false)
  await expectAddTimes('12:00', '12:00')

  await openEntry(user, entry.item)
  await user.click(screen.getByRole('button', { name: 'Next day' }))

  expect(
    await screen.findByRole('heading', { name: 'Wednesday 18 November 2026' }),
  ).toBeInTheDocument()
  entry = (await findEntries(1))[0]
  expect(entry).toMatchObject({ description: 'Today', open: false })
  expect(editorShown()).toBe(false)
  await expectAddTimes('10:00', '10:00')

  await user.click(screen.getByRole('button', { name: 'Previous day' }))
  expect(
    await screen.findByRole('heading', { name: 'Tuesday 17 November 2026' }),
  ).toBeInTheDocument()
  entry = (await findEntries(1))[0]
  await openEntry(user, entry.item)
  await user.click(screen.getByRole('button', { name: 'Today' }))

  expect(
    await screen.findByRole('heading', { name: 'Wednesday 18 November 2026' }),
  ).toBeInTheDocument()
  entry = (await findEntries(1))[0]
  expect(entry).toMatchObject({ description: 'Today', open: false })
  expect(editorShown()).toBe(false)
  await expectAddTimes('10:00', '10:00')
})

test("puts focus on the saved entry's row after Save, also when it moved", async () => {
  const { user } = await renderPage(workLabels, twoEntries)
  const [, second] = await findEntries(2)
  const editor = await openEntry(user, second.item)
  const start = editor.getByRole('textbox', { name: 'Start' })
  await user.clear(start)
  await user.type(start, '08:00')

  await user.click(editor.getByRole('button', { name: 'Save' }))

  await waitFor(() =>
    expect(listedEntries().map(({ description }) => description)).toEqual([
      'Filing',
      'Email',
    ]),
  )
  await waitFor(() => expect(rowOf('Filing')).toHaveFocus())
})

test("puts focus on the entry's row after Cancel", async () => {
  const { user } = await renderPage(workLabels, twoEntries)
  const [first] = await findEntries(2)
  const editor = await openEntry(user, first.item)

  await user.click(editor.getByRole('button', { name: 'Cancel' }))

  expect(editorShown()).toBe(false)
  await waitFor(() => expect(rowOf('Email')).toHaveFocus())
})

test("puts focus on the entry's row after Esc", async () => {
  const { user } = await renderPage(workLabels, twoEntries)
  const [, second] = await findEntries(2)
  await openEntry(user, second.item)

  await user.keyboard('{Escape}')

  expect(editorShown()).toBe(false)
  await waitFor(() => expect(rowOf('Filing')).toHaveFocus())
})

test('after adding an entry that ends at 24:00 the next empty row is empty with focus on Start', async () => {
  const { user } = await renderPage(workLabels, [
    { date: '2026-11-18', start: '09:00', end: '10:00', label: 'Client' },
  ])
  await findEntries(1)
  await expectAddTimes('10:00', '10:00')

  await addEntry(user, { end: '24:00', label: 'Client' })

  const found = await findEntries(2)
  expect(found[1]).toMatchObject({ start: '10:00', end: '24:00' })
  await expectAddTimes('', '')
  await waitFor(() => {
    expect(addForm().getByRole('textbox', { name: 'Start' })).toHaveFocus()
  })
})

// On the night the clocks go forward 02:00–02:59 doesn't exist: a start of
// 02:30 becomes 03:30, past an end of 03:00. The real times decide whether End
// is after Start (specs/clock-changes.feature).

test('shows "End must be after start" and no duration in the add row when the start moves past the end as the clocks go forward', async () => {
  const { user } = await renderOnDay('2026-03-29')
  await screen.findByText('No entries')

  await fillAddForm(user, { start: '02:30', end: '03:00' })

  expect(addForm().getByText(endNotAfterStart)).toBeInTheDocument()
  expect(
    addForm().getByRole('textbox', { name: 'End' }),
  ).not.toHaveAccessibleDescription(/Duration/)
})

test('rejects adding an entry whose start moves past its end as the clocks go forward', async () => {
  const { user } = await renderOnDay('2026-03-29')
  await screen.findByText('No entries')

  await addEntry(user, { start: '02:30', end: '03:00', label: 'Client' })

  expect(await addForm().findByRole('alert')).toHaveTextContent(
    endNotAfterStart,
  )
  expect(screen.getAllByRole('alert')).toHaveLength(1)
  expect(screen.getByText('No entries')).toBeInTheDocument()
  expect(listedEntries()).toEqual([])
})

test('rejects adding with Enter an entry whose start moves past its end as the clocks go forward', async () => {
  const { user } = await renderOnDay('2026-03-29')
  await screen.findByText('No entries')

  await fillAddForm(user, { start: '02:30', end: '03:00', label: 'Client' })
  await user.type(addForm().getByRole('textbox', { name: 'End' }), '{Enter}')

  expect(await addForm().findByRole('alert')).toHaveTextContent(
    endNotAfterStart,
  )
  expect(screen.getAllByRole('alert')).toHaveLength(1)
  expect(screen.getByText('No entries')).toBeInTheDocument()
  expect(listedEntries()).toEqual([])
})

test('shows "End must be after start" and rejects the save in the editor when the start moves past the end as the clocks go forward', async () => {
  const { user } = await renderOnDay('2026-03-29', [
    { date: '2026-03-29', start: '01:00', end: '04:00', label: 'Client' },
  ])
  const [entry] = await findEntries(1)
  const editor = await openEntry(user, entry.item)
  const start = editor.getByRole('textbox', { name: 'Start' })
  const end = editor.getByRole('textbox', { name: 'End' })

  await user.clear(start)
  await user.type(start, '02:30')
  await user.clear(end)
  await user.type(end, '03:00')

  expect(editor.getByText(endNotAfterStart)).toBeInTheDocument()
  expect(end).not.toHaveAccessibleDescription(/Duration/)

  await user.type(end, '{Enter}')

  expect(await editor.findByRole('alert')).toHaveTextContent(endNotAfterStart)
  expect(screen.getAllByRole('alert')).toHaveLength(1)
  expect(editorShown()).toBe(true)

  await user.click(editor.getByRole('button', { name: 'Cancel' }))

  expect(listedEntries()).toMatchObject([
    { start: '01:00', end: '04:00', label: 'Client' },
  ])
})
