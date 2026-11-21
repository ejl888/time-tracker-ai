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
  await addLabel('Travel')
  unmount()

  render(<App />)

  const list = await screen.findByRole('list')
  expect(await within(list).findByDisplayValue('Travel')).toBeInTheDocument()
})

test('stores labels in localStorage under timetracker.labels', async () => {
  render(<App />)
  await addLabel('Travel')

  const stored = JSON.parse(localStorage.getItem('timetracker.labels') ?? '[]')
  expect(stored).toEqual([
    expect.objectContaining({ name: 'Travel', deleted: false }),
  ])
})
