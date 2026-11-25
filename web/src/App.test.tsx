import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, test } from 'vitest'
import App from './App'

beforeEach(() => {
  localStorage.clear()
  document.documentElement.scrollTop = 0
})

test('shows the app name as heading', () => {
  render(<App />)

  expect(
    screen.getByRole('heading', { name: 'Timetracker' }),
  ).toBeInTheDocument()
})

/** Switches to the settings screen, which holds the labels, with its tab button. */
async function openSettings() {
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: 'Settings' }))
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
  await openSettings()
  await addLabel('Travel')
  unmount()

  render(<App />)
  await openSettings()

  const list = await screen.findByRole('list')
  expect(await within(list).findByDisplayValue('Travel')).toBeInTheDocument()
})

test('stores labels in localStorage under timetracker.labels', async () => {
  render(<App />)
  await openSettings()
  await addLabel('Travel')

  const stored = JSON.parse(localStorage.getItem('timetracker.labels') ?? '[]')
  expect(stored).toEqual([
    expect.objectContaining({ name: 'Travel', deleted: false }),
  ])
})

/** Switches to the overview screen with its tab button. */
async function openOverview() {
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: 'Overview' }))
}

/**
 * Adds an entry for today through the add form of the overview screen.
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

test('opens on the overview screen', async () => {
  render(<App />)

  expect(screen.getByRole('button', { name: 'Overview' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  expect(screen.getByRole('button', { name: 'Settings' })).toHaveAttribute(
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

test('switches between the overview and settings screens', async () => {
  render(<App />)

  await openSettings()

  expect(screen.getByRole('button', { name: 'Settings' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  expect(screen.getByRole('button', { name: 'Overview' })).toHaveAttribute(
    'aria-pressed',
    'false',
  )
  expect(
    await screen.findByRole('form', { name: 'Add label' }),
  ).toBeInTheDocument()
  expect(
    screen.queryByRole('form', { name: 'Add entry' }),
  ).not.toBeInTheDocument()

  await openOverview()

  expect(screen.getByRole('button', { name: 'Overview' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  expect(screen.getByRole('button', { name: 'Settings' })).toHaveAttribute(
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

test('the overview screen has one h1, an h2 for the period and an h3 for the open day, and no heading "Entries"', async () => {
  render(<App />)
  await screen.findByRole('heading', { level: 3 })

  expect(
    screen.queryByRole('heading', { name: 'Entries' }),
  ).not.toBeInTheDocument()
  const levels = screen
    .getAllByRole('heading')
    .map((heading) => heading.tagName)
  expect(levels).toEqual(['H1', 'H2', 'H3'])
  expect(
    screen.getByRole('heading', { level: 1, name: 'Timetracker' }),
  ).toBeInTheDocument()
  expect(
    screen.getByRole('heading', { level: 2, name: /^Week \d+$/ }),
  ).toBeInTheDocument()
  expect(
    screen.getByRole('heading', {
      level: 3,
      name: /^\w+day \d{1,2} \w+ \d{4}$/,
    }),
  ).toBeInTheDocument()
})

test('keeps an added entry after a reload and stores it under timetracker.entries', async () => {
  const { unmount } = render(<App />)
  await openSettings()
  await addLabel('Client')
  await openOverview()
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
  await openSettings()
  await addLabel('Client')
  await openOverview()
  await addEntry('Client', 'Review')

  await openSettings()

  expect(
    await screen.findByText('In use: create a new label to change this'),
  ).toBeInTheDocument()
})

test('shows the contract above the labels on the settings screen', async () => {
  render(<App />)

  await openSettings()

  const contract = await screen.findByRole('heading', { name: 'Contract' })
  const labels = await screen.findByRole('heading', { name: 'Labels' })
  expect(
    contract.compareDocumentPosition(labels) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy()
})

test('keeps a saved contract after a reload and stores it under timetracker.contracts', async () => {
  const user = userEvent.setup()
  const { unmount } = render(<App />)
  await openSettings()
  const limit = await screen.findByRole('textbox', {
    name: 'Billable limit per week',
  })
  await user.clear(limit)
  await user.type(limit, '40')
  await user.click(screen.getByRole('button', { name: 'Save contract' }))
  await screen.findByRole('status')
  unmount()

  render(<App />)
  await openSettings()

  expect(
    await screen.findByRole('textbox', { name: 'Billable limit per week' }),
  ).toHaveValue('40:00')
  const stored = JSON.parse(
    localStorage.getItem('timetracker.contracts') ?? '[]',
  )
  expect(stored).toEqual([
    expect.objectContaining({
      billingCycle: 'week',
      billableLimit: 40 * 60,
      deleted: false,
    }),
  ])
})

// The menu, for phones

function menuIcon() {
  return screen.getByRole('button', { name: 'Menu' })
}

/** Chooses a screen in the menu, with the page scrolled down. */
async function chooseInMenu(title: string) {
  const user = userEvent.setup()
  await user.click(menuIcon())
  const list = document.querySelector<HTMLElement>('div.menu')
  if (!list) throw new Error('there is no menu')
  document.documentElement.scrollTop = 300
  await user.click(within(list).getByRole('button', { name: title }))
}

test('the menu goes to the top of Settings and back, with focus on its icon', async () => {
  render(<App />)
  await screen.findByRole('form', { name: 'Add entry' })

  await chooseInMenu('Settings')

  await screen.findByRole('form', { name: 'Add label' })
  expect(
    screen.queryByRole('form', { name: 'Add entry' }),
  ).not.toBeInTheDocument()
  expect(
    screen.getByRole('heading', { level: 2, name: 'Settings' }),
  ).toBeInTheDocument()
  expect(document.querySelector('div.settings-bar')).toContainElement(
    menuIcon(),
  )
  expect(menuIcon()).toHaveFocus()
  expect(menuIcon()).toHaveAttribute('aria-expanded', 'false')
  expect(document.documentElement.scrollTop).toBe(0)

  await chooseInMenu('Overview')

  await screen.findByRole('form', { name: 'Add entry' })
  expect(
    screen.queryByRole('form', { name: 'Add label' }),
  ).not.toBeInTheDocument()
  expect(document.querySelector('div.period-bar')).toContainElement(menuIcon())
  expect(menuIcon()).toHaveFocus()
  expect(menuIcon()).toHaveAttribute('aria-expanded', 'false')
  expect(document.documentElement.scrollTop).toBe(0)
})

test('the menu marks the screen shown', async () => {
  const user = userEvent.setup()
  render(<App />)
  const marked = () =>
    [...document.querySelectorAll('.menu [aria-current="page"]')].map(
      (button) => button.textContent,
    )
  await user.click(menuIcon())
  expect(marked()).toEqual(['Overview'])
  await user.click(menuIcon())

  await openSettings()

  expect(marked()).toEqual(['Settings'])
})

test('choosing the current screen in the menu only closes it', async () => {
  const user = userEvent.setup()
  render(<App />)
  const form = await screen.findByRole('form', { name: 'Add entry' })
  await user.type(
    within(form).getByRole('textbox', { name: 'Description' }),
    'Not saved',
  )

  await chooseInMenu('Overview')

  expect(menuIcon()).toHaveAttribute('aria-expanded', 'false')
  expect(
    within(screen.getByRole('form', { name: 'Add entry' })).getByRole(
      'textbox',
      { name: 'Description' },
    ),
  ).toHaveValue('Not saved')
  expect(document.documentElement.scrollTop).toBe(300)
})

test('loading the app takes no focus', async () => {
  render(<App />)
  await screen.findByRole('form', { name: 'Add entry' })

  expect(menuIcon()).not.toHaveFocus()
  expect(document.body).toHaveFocus()
})

test('the tabs do not move focus to the menu icon, also after using the menu', async () => {
  render(<App />)
  await screen.findByRole('form', { name: 'Add entry' })

  await openSettings()
  await screen.findByRole('form', { name: 'Add label' })
  expect(screen.getByRole('button', { name: 'Settings' })).toHaveFocus()
  expect(menuIcon()).not.toHaveFocus()

  await chooseInMenu('Overview')
  await screen.findByRole('form', { name: 'Add entry' })
  expect(menuIcon()).toHaveFocus()

  await openSettings()
  await screen.findByRole('form', { name: 'Add label' })
  expect(screen.getByRole('button', { name: 'Settings' })).toHaveFocus()

  await openOverview()
  await screen.findByRole('form', { name: 'Add entry' })
  expect(screen.getByRole('button', { name: 'Overview' })).toHaveFocus()
})
