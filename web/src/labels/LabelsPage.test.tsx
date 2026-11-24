import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Temporal } from 'temporal-polyfill'
import { afterEach, expect, test, vi } from 'vitest'
import { fixedClock } from '../domain/clock.ts'
import { createEntryService } from '../domain/entries.ts'
import { createLabelService } from '../domain/labels.ts'
import type { Entry, Label } from '../domain/records.ts'
import { InMemoryRepository } from '../domain/repository.ts'
import { LabelsPage } from './LabelsPage.tsx'

const clock = fixedClock(Temporal.Instant.from('2026-11-21T09:00:00Z'))

/**
 * Renders the page on in-memory services, seeded with these labels.
 * Labels named in `used` get an entry, so they are in use.
 */
async function renderPage(
  seed: { name: string; billable: boolean }[] = [],
  used: string[] = [],
) {
  const entryRepository = new InMemoryRepository<Entry>()
  const labels = createLabelService(
    new InMemoryRepository<Label>(),
    entryRepository,
    clock,
  )
  const entries = createEntryService(entryRepository, clock)
  for (const { name, billable } of seed) {
    const created = await labels.create(name, { billable })
    if (created.ok && used.includes(name)) {
      await entries.add({
        date: Temporal.PlainDate.from('2026-11-20'),
        start: Temporal.PlainTime.from('09:00'),
        end: Temporal.PlainTime.from('10:00'),
        labelId: created.value.id,
        description: 'Work',
        timeZone: 'Europe/Amsterdam',
      })
    }
  }
  render(<LabelsPage labels={labels} />)
  await screen.findByRole('heading', { name: 'Labels' })
  const form = screen.getByRole('form', { name: 'Add label' })
  return {
    user: userEvent.setup(),
    labels,
    nameField: within(form).getByRole('textbox', { name: 'Name' }),
    billableBox: within(form).getByRole('checkbox', { name: 'Billable' }),
    addButton: within(form).getByRole('button', { name: 'Add' }),
  }
}

/** The labels in the list, in order, as name and billable setting. */
function listedLabels() {
  const list = screen.queryByRole('list')
  if (!list) return []
  return within(list)
    .queryAllByRole('listitem')
    .map((item) => ({
      name: (
        within(item).getByRole('textbox', {
          name: 'Label name',
        }) as HTMLInputElement
      ).value,
      billable: (
        within(item).getByRole('checkbox', {
          name: 'Billable',
        }) as HTMLInputElement
      ).checked,
    }))
}

/** Waits until a label with this name is listed. */
async function findLabel(name: string) {
  const list = await screen.findByRole('list')
  return within(list).findByDisplayValue(name)
}

test('lists the existing labels by name with their billable setting', async () => {
  await renderPage([
    { name: 'Support', billable: true },
    { name: 'Lunch', billable: false },
  ])

  await findLabel('Support')

  expect(listedLabels()).toEqual([
    { name: 'Lunch', billable: false },
    { name: 'Support', billable: true },
  ])
})

test('says that only billable labels count as worked hours', async () => {
  await renderPage()

  expect(
    screen.getByText('Only billable labels count as worked hours.'),
  ).toBeInTheDocument()
})

test('adds a billable label by default and resets the form', async () => {
  const { user, nameField, billableBox, addButton } = await renderPage()

  await user.type(nameField, 'Travel')
  await user.click(addButton)

  await findLabel('Travel')
  expect(listedLabels()).toEqual([{ name: 'Travel', billable: true }])
  expect(nameField).toHaveValue('')
  expect(billableBox).toBeChecked()
})

test('adds a non-billable label when Billable is unticked', async () => {
  const { user, nameField, billableBox, addButton } = await renderPage()

  await user.type(nameField, 'Lunch')
  await user.click(billableBox)
  await user.click(addButton)

  await findLabel('Lunch')
  expect(listedLabels()).toEqual([{ name: 'Lunch', billable: false }])
})

test('adds a label with Enter in the name field', async () => {
  const { user, nameField } = await renderPage()

  await user.type(nameField, 'Travel{Enter}')

  await findLabel('Travel')
  expect(listedLabels()).toEqual([{ name: 'Travel', billable: true }])
})

test('rejects an empty name', async () => {
  const { user, addButton } = await renderPage()

  await user.click(addButton)

  expect(await screen.findByRole('alert')).toHaveTextContent('Enter a name')
  expect(listedLabels()).toEqual([])
})

test('rejects a duplicate name and keeps the typed text', async () => {
  const { user, nameField, addButton } = await renderPage([
    { name: 'Support', billable: true },
  ])
  await findLabel('Support')

  await user.type(nameField, ' support ')
  await user.click(addButton)

  expect(await screen.findByRole('alert')).toHaveTextContent(
    'A label named support already exists',
  )
  expect(nameField).toHaveValue(' support ')
  expect(listedLabels()).toEqual([{ name: 'Support', billable: true }])
})

test('clears the message after a successful add', async () => {
  const { user, nameField, addButton } = await renderPage()
  await user.click(addButton)
  await screen.findByRole('alert')

  await user.type(nameField, 'Travel')
  await user.click(addButton)

  await findLabel('Travel')
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})

/** The list item of the label with this name, once it is listed. */
async function findItem(name: string) {
  const field = await findLabel(name)
  const item = field.closest('li')
  if (!item) throw new Error(`No list item for ${name}`)
  return item
}

/** The names and billable settings of the labels in the service. */
async function savedLabels(labels: { list(): Promise<Label[]> }) {
  return (await labels.list()).map(({ name, billable }) => ({ name, billable }))
}

test('renames a label with Enter', async () => {
  const { user, labels } = await renderPage([
    { name: 'Support', billable: true },
  ])
  const field = within(await findItem('Support')).getByRole('textbox', {
    name: 'Label name',
  })

  await user.clear(field)
  await user.type(field, 'Helpdesk{Enter}')

  await waitFor(async () =>
    expect(await savedLabels(labels)).toEqual([
      { name: 'Helpdesk', billable: true },
    ]),
  )
  await findLabel('Helpdesk')
  expect(listedLabels()).toEqual([{ name: 'Helpdesk', billable: true }])
})

test('renames a label when leaving the field', async () => {
  const { user, labels } = await renderPage([
    { name: 'Support', billable: true },
  ])
  const field = within(await findItem('Support')).getByRole('textbox', {
    name: 'Label name',
  })

  await user.clear(field)
  await user.type(field, 'Helpdesk')
  await user.tab()

  await waitFor(async () =>
    expect(await savedLabels(labels)).toEqual([
      { name: 'Helpdesk', billable: true },
    ]),
  )
  expect(listedLabels()).toEqual([{ name: 'Helpdesk', billable: true }])
})

test('reverts a rename with Esc and saves nothing', async () => {
  const { user, labels } = await renderPage([
    { name: 'Support', billable: true },
  ])
  const field = within(await findItem('Support')).getByRole('textbox', {
    name: 'Label name',
  })

  await user.clear(field)
  await user.type(field, 'Helpdesk')
  expect(field).toHaveValue('Helpdesk')
  await user.keyboard('{Escape}')

  expect(field).toHaveValue('Support')
  await user.tab()
  expect(field).toHaveValue('Support')
  expect(await savedLabels(labels)).toEqual([
    { name: 'Support', billable: true },
  ])
})

test('rejects a rename to an existing name and shows the saved name again', async () => {
  const { user, labels } = await renderPage([
    { name: 'Meeting', billable: true },
    { name: 'Support', billable: true },
  ])
  const field = within(await findItem('Meeting')).getByRole('textbox', {
    name: 'Label name',
  })

  await user.clear(field)
  await user.type(field, 'support{Enter}')

  expect(await screen.findByRole('alert')).toHaveTextContent(
    'A label named support already exists',
  )
  expect(field).toHaveValue('Meeting')
  expect(await savedLabels(labels)).toEqual([
    { name: 'Meeting', billable: true },
    { name: 'Support', billable: true },
  ])
})

test('shows a rejected rename inside that label, not under the add form', async () => {
  const { user } = await renderPage([
    { name: 'Meeting', billable: true },
    { name: 'Support', billable: true },
  ])
  const item = await findItem('Meeting')
  const field = within(item).getByRole('textbox', { name: 'Label name' })

  await user.clear(field)
  await user.type(field, 'support{Enter}')

  expect(await within(item).findByRole('alert')).toHaveTextContent(
    'A label named support already exists',
  )
  const form = screen.getByRole('form', { name: 'Add label' })
  expect(within(form).queryByRole('alert')).not.toBeInTheDocument()
  expect(
    within(await findItem('Support')).queryByRole('alert'),
  ).not.toBeInTheDocument()
})

test('shows a rejected add at the add form, not inside a label', async () => {
  const { user, nameField, addButton } = await renderPage([
    { name: 'Support', billable: true },
  ])
  await findLabel('Support')

  await user.type(nameField, 'support')
  await user.click(addButton)

  expect(await screen.findByRole('alert')).toHaveTextContent(
    'A label named support already exists',
  )
  for (const item of screen.getAllByRole('listitem')) {
    expect(within(item).queryByRole('alert')).not.toBeInTheDocument()
  }
})

test('rejects a rename to an empty name and shows the saved name again', async () => {
  const { user, labels } = await renderPage([
    { name: 'Support', billable: true },
  ])
  const field = within(await findItem('Support')).getByRole('textbox', {
    name: 'Label name',
  })

  await user.clear(field)
  await user.keyboard('{Enter}')

  expect(await screen.findByRole('alert')).toHaveTextContent('Enter a name')
  expect(field).toHaveValue('Support')
  expect(await savedLabels(labels)).toEqual([
    { name: 'Support', billable: true },
  ])
})

test('changes the billable setting of an unused label', async () => {
  const { user, labels } = await renderPage([
    { name: 'Support', billable: true },
  ])
  const box = within(await findItem('Support')).getByRole('checkbox', {
    name: 'Billable',
  })

  await user.click(box)

  await waitFor(async () =>
    expect(await savedLabels(labels)).toEqual([
      { name: 'Support', billable: false },
    ]),
  )
  expect(box).not.toBeChecked()
})

test('locks the billable setting of a used label', async () => {
  await renderPage(
    [
      { name: 'Meeting', billable: true },
      { name: 'Support', billable: true },
    ],
    ['Support'],
  )
  const note = 'In use: create a new label to change this'

  const used = await findItem('Support')
  expect(
    within(used).getByRole('checkbox', { name: 'Billable' }),
  ).toBeDisabled()
  expect(used).toHaveTextContent(note)

  const unused = await findItem('Meeting')
  expect(
    within(unused).getByRole('checkbox', { name: 'Billable' }),
  ).toBeEnabled()
  expect(unused).not.toHaveTextContent(note)
})

afterEach(() => {
  vi.restoreAllMocks()
})

/** Clicks Delete on the label with this name, answering the confirmation. */
async function deleteLabel(
  user: ReturnType<typeof userEvent.setup>,
  name: string,
  confirmed: boolean,
) {
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(confirmed)
  const item = await findItem(name)
  await user.click(within(item).getByRole('button', { name: 'Delete' }))
  return confirm
}

test('deletes a label after confirmation', async () => {
  const { user, labels } = await renderPage([
    { name: 'Meeting', billable: true },
    { name: 'Support', billable: true },
  ])

  const confirm = await deleteLabel(user, 'Support', true)

  expect(confirm).toHaveBeenCalledWith('Delete label Support?')
  await waitFor(() =>
    expect(listedLabels()).toEqual([{ name: 'Meeting', billable: true }]),
  )
  expect(await savedLabels(labels)).toEqual([
    { name: 'Meeting', billable: true },
  ])
})

test('keeps the label when the deletion is cancelled', async () => {
  const { user, labels } = await renderPage([
    { name: 'Support', billable: true },
  ])

  const confirm = await deleteLabel(user, 'Support', false)

  expect(confirm).toHaveBeenCalledWith('Delete label Support?')
  expect(listedLabels()).toEqual([{ name: 'Support', billable: true }])
  expect(await savedLabels(labels)).toEqual([
    { name: 'Support', billable: true },
  ])
})

test('deletes a used label after confirmation', async () => {
  const { user, labels } = await renderPage(
    [{ name: 'Support', billable: true }],
    ['Support'],
  )

  await deleteLabel(user, 'Support', true)

  await waitFor(() => expect(listedLabels()).toEqual([]))
  expect(await savedLabels(labels)).toEqual([])
})
