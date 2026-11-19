import { render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import App from './App'

test('shows the app name as heading', () => {
  render(<App />)

  expect(
    screen.getByRole('heading', { name: 'Timetracker' }),
  ).toBeInTheDocument()
})
