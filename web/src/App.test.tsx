import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, test } from 'vitest'
import App from './App'

beforeEach(() => {
  localStorage.clear()
})

test('shows the app name as heading', () => {
  render(<App />)

  expect(
    screen.getByRole('heading', { name: 'Timetracker' }),
  ).toBeInTheDocument()
})

/** Switches to the labels screen with its tab button. */
async function openLabels() {
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: 'Labels' }))
}

/** Adds a label through the add form of the labels screen. */
async function addLabel(name: string) {
  const user = userEvent.setup()
  const form = await screen.findByRole('form', { name: 'Add label' })
  await user.type(within(form).getByRole('textbox', { name: 'Name' }), name)
  await user.click(within(form).getByRole('button', { name: 'Add' }))
  await screen.findByDisplayValue(name)
}

test('keeps an added label after a reload', async () => {
  const { unmount } = render(<App />)
  await openLabels()
  await addLabel('Travel')
  unmount()

  render(<App />)
  await openLabels()

  const list = await screen.findByRole('list')
  expect(await within(list).findByDisplayValue('Travel')).toBeInTheDocument()
})

test('stores labels in localStorage under timetracker.labels', async () => {
  render(<App />)
  await openLabels()
  await addLabel('Travel')

  const stored = JSON.parse(localStorage.getItem('timetracker.labels') ?? '[]')
  expect(stored).toEqual([
    expect.objectContaining({ name: 'Travel', deleted: false }),
  ])
})

/** Switches to the entries screen with its tab button. */
async function openEntries() {
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: 'Entries' }))
}

/**
 * Adds an entry for today through the add form of the entries screen.
 * The entry is dated today, so it is never after today; only the date counts for that rule.
 */
async function addEntry(label: string, description: string) {
  const user = userEvent.setup()
  const form = await screen.findByRole('form', { name: 'Add entry' })
  const row = within(form)
  await user.clear(row.getByRole('textbox', { name: 'Start' }))
  await user.type(row.getByRole('textbox', { name: 'Start' }), '00:10')
  await user.clear(row.getByRole('textbox', { name: 'End' }))
  await user.type(row.getByRole('textbox', { name: 'End' }), '00:20')
  await row.findByRole('option', { name: label })
  await user.selectOptions(row.getByRole('combobox', { name: 'Label' }), label)
  await user.type(
    row.getByRole('textbox', { name: 'Description' }),
    description,
  )
  await user.click(row.getByRole('button', { name: 'Add' }))
  await screen.findByRole('list', { name: 'Entries' })
}

test('opens on the entries screen', async () => {
  render(<App />)

  expect(screen.getByRole('button', { name: 'Entries' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  expect(screen.getByRole('button', { name: 'Labels' })).toHaveAttribute(
    'aria-pressed',
    'false',
  )
  expect(
    await screen.findByRole('form', { name: 'Add entry' }),
  ).toBeInTheDocument()
  expect(
    screen.queryByRole('form', { name: 'Add label' }),
  ).not.toBeInTheDocument()
})

test('switches between the entries and labels screens', async () => {
  render(<App />)

  await openLabels()

  expect(screen.getByRole('button', { name: 'Labels' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  expect(screen.getByRole('button', { name: 'Entries' })).toHaveAttribute(
    'aria-pressed',
    'false',
  )
  expect(
    await screen.findByRole('form', { name: 'Add label' }),
  ).toBeInTheDocument()
  expect(
    screen.queryByRole('form', { name: 'Add entry' }),
  ).not.toBeInTheDocument()

  await openEntries()

  expect(screen.getByRole('button', { name: 'Entries' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  expect(screen.getByRole('button', { name: 'Labels' })).toHaveAttribute(
    'aria-pressed',
    'false',
  )
  expect(
    await screen.findByRole('form', { name: 'Add entry' }),
  ).toBeInTheDocument()
  expect(
    screen.queryByRole('form', { name: 'Add label' }),
  ).not.toBeInTheDocument()
})

test('keeps an added entry after a reload and stores it under timetracker.entries', async () => {
  const { unmount } = render(<App />)
  await openLabels()
  await addLabel('Client')
  await openEntries()
  await addEntry('Client', 'Review')
  unmount()

  render(<App />)

  const list = await screen.findByRole('list', { name: 'Entries' })
  expect(
    await within(list).findByRole('button', { name: /Review/ }),
  ).toBeInTheDocument()
  const stored = JSON.parse(localStorage.getItem('timetracker.entries') ?? '[]')
  expect(stored).toEqual([
    expect.objectContaining({ description: 'Review', deleted: false }),
  ])
})

test('shows a label used by an entry as in use on the labels screen', async () => {
  render(<App />)
  await openLabels()
  await addLabel('Client')
  await openEntries()
  await addEntry('Client', 'Review')

  await openLabels()

  expect(
    await screen.findByText('In use: create a new label to change this'),
  ).toBeInTheDocument()
})
