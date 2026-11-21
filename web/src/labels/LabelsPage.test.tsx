import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Temporal } from 'temporal-polyfill'
import { expect, test } from 'vitest'
import { fixedClock } from '../domain/clock.ts'
import { createLabelService } from '../domain/labels.ts'
import type { Entry, Label } from '../domain/records.ts'
import { InMemoryRepository } from '../domain/repository.ts'
import { LabelsPage } from './LabelsPage.tsx'

function labelService() {
  return createLabelService(
    new InMemoryRepository<Label>(),
    new InMemoryRepository<Entry>(),
    fixedClock(Temporal.Instant.from('2026-11-21T09:00:00Z')),
  )
}

async function renderPage(seed: { name: string; billable: boolean }[] = []) {
  const labels = labelService()
  for (const { name, billable } of seed) {
    await labels.create(name, { billable })
  }
  render(<LabelsPage labels={labels} />)
  await screen.findByRole('heading', { name: 'Labels' })
  const form = screen.getByRole('form', { name: 'Add label' })
  return {
    user: userEvent.setup(),
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
