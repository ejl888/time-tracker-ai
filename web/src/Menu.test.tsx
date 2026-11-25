import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Temporal } from 'temporal-polyfill'
import { expect, test, vi } from 'vitest'
import { fixedClock } from './domain/clock.ts'
import { createContractService } from './domain/contracts.ts'
import { createEntryService } from './domain/entries.ts'
import { createLabelService } from './domain/labels.ts'
import type { Contract, Entry, ExpectedHours, Label } from './domain/records.ts'
import { InMemoryRepository } from './domain/repository.ts'
import { EntriesPage } from './entries/EntriesPage.tsx'
import { Menu } from './Menu.tsx'
import { SettingsPage } from './settings/SettingsPage.tsx'

// The menu that goes to the screens on a phone, and its place on the pages (US-18).

const screens: { screen: 'entries' | 'settings'; title: string }[] = [
  { screen: 'entries', title: 'Overview' },
  { screen: 'settings', title: 'Settings' },
]

/** Renders the menu on the Overview screen, between other elements. */
function renderMenu({ focused }: { focused?: boolean } = {}) {
  const onGoTo = vi.fn()
  render(
    <>
      <button type="button">Outside</button>
      <p>Some text</p>
      <Menu
        screens={screens}
        current="entries"
        onGoTo={onGoTo}
        focused={focused}
      />
    </>,
  )
  return { user: userEvent.setup(), onGoTo }
}

function icon() {
  return screen.getByRole('button', { name: 'Menu' })
}

/** The list of screens, open or closed. */
function list() {
  const found = document.querySelector<HTMLElement>('div.menu-wrap > div.menu')
  if (!found) throw new Error('there is no menu')
  return found
}

function choice(title: string) {
  return within(list()).getByRole('button', { name: title })
}

function expectOpen() {
  expect(icon()).toHaveAttribute('aria-expanded', 'true')
  expect(list().hidden).toBe(false)
}

function expectClosed() {
  expect(icon()).toHaveAttribute('aria-expanded', 'false')
  expect(list().hidden).toBe(true)
}

test('is closed at first, with an icon button that controls the list', () => {
  renderMenu()

  expectClosed()
  expect(icon()).toHaveClass('icon-btn')
  expect(icon().parentElement).toHaveClass('menu-wrap')
  expect(list().id).not.toBe('')
  expect(icon()).toHaveAttribute('aria-controls', list().id)
  expect(icon()).not.toHaveAttribute('aria-haspopup')
  expect(within(list()).queryAllByRole('button')).toEqual([])
  expect(document.body).toHaveFocus()
})

test('a click on the icon opens and closes the list', async () => {
  const { user } = renderMenu()

  await user.click(icon())

  expectOpen()
  const titles = within(list())
    .getAllByRole('button')
    .map((button) => button.textContent)
  expect(titles).toEqual(['Overview', 'Settings'])

  await user.click(icon())

  expectClosed()
})

test('works from the keyboard', async () => {
  const { user, onGoTo } = renderMenu()
  act(() => icon().focus())

  await user.keyboard('{Enter}')
  expectOpen()
  await user.tab()
  expect(choice('Overview')).toHaveFocus()
  await user.tab()
  expect(choice('Settings')).toHaveFocus()
  await user.keyboard('{Enter}')

  expectClosed()
  expect(onGoTo).toHaveBeenCalledExactlyOnceWith('settings')
})

test('marks only the current screen', async () => {
  const { user } = renderMenu()

  await user.click(icon())

  expect(choice('Overview')).toHaveAttribute('aria-current', 'page')
  expect(choice('Settings')).not.toHaveAttribute('aria-current')
})

test.each([
  ['Settings', 'settings'],
  ['Overview', 'entries'],
])('choosing %s closes the list and goes there', async (title, chosen) => {
  const { user, onGoTo } = renderMenu()
  await user.click(icon())

  await user.click(choice(title))

  expectClosed()
  expect(onGoTo).toHaveBeenCalledExactlyOnceWith(chosen)
})

test('choosing the current screen puts focus back on the icon', async () => {
  const { user } = renderMenu()
  await user.click(icon())

  await user.click(choice('Overview'))

  expect(icon()).toHaveFocus()
})

test.each([0, 1, 2])(
  'Escape closes the list and focuses the icon, after %i tabs from the icon',
  async (tabs) => {
    const { user, onGoTo } = renderMenu()
    await user.click(icon())
    for (let i = 0; i < tabs; i += 1) await user.tab()
    expect([icon(), choice('Overview'), choice('Settings')][tabs]).toHaveFocus()

    await user.keyboard('{Escape}')

    expectClosed()
    expect(icon()).toHaveFocus()
    expect(onGoTo).not.toHaveBeenCalled()
  },
)

test('a click on a button outside closes the list and leaves focus there', async () => {
  const { user, onGoTo } = renderMenu()
  await user.click(icon())

  await user.click(screen.getByRole('button', { name: 'Outside' }))

  expectClosed()
  expect(screen.getByRole('button', { name: 'Outside' })).toHaveFocus()
  expect(onGoTo).not.toHaveBeenCalled()
})

test('a click on text outside closes the list and does not focus the icon', async () => {
  const { user } = renderMenu()
  await user.click(icon())

  await user.click(screen.getByText('Some text'))

  expectClosed()
  expect(icon()).not.toHaveFocus()
})

test('a click beside the choices in the list keeps it open', async () => {
  const { user, onGoTo } = renderMenu()
  await user.click(icon())

  await user.click(list())

  expectOpen()
  expect(onGoTo).not.toHaveBeenCalled()
})

test('the icon takes focus on mount when focused', () => {
  renderMenu({ focused: true })

  expect(icon()).toHaveFocus()
  expectClosed()
})

// On the pages

const timeZone = 'Europe/Amsterdam'

/** In-memory services without a contract, on Wed 18 Nov 2026 (week 47), with an entry in week 46. */
async function seededServices() {
  const clock = fixedClock(Temporal.Instant.from('2026-11-18T11:00:00Z'))
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
  const added = await entries.add({
    date: Temporal.PlainDate.from('2026-11-10'),
    start: Temporal.PlainTime.from('09:00'),
    end: Temporal.PlainTime.from('10:00'),
    labelId: label.value.id,
    description: '',
    timeZone,
  })
  if (!added.ok) throw new Error(`could not seed entry: ${added.error}`)
  return { entries, labels, contracts, clock, timeZone }
}

function menuFor(current: 'entries' | 'settings', onGoTo = vi.fn()) {
  return <Menu screens={screens} current={current} onGoTo={onGoTo} />
}

/** A promise to wait for, and a function that resolves it and lets the steps after it run. */
function releasable() {
  let resolve!: () => void
  const released = new Promise<void>((done) => {
    resolve = done
  })
  const release = () =>
    act(async () => {
      resolve()
      await new Promise((done) => setTimeout(done, 20))
    })
  return { released, release }
}

function periodBar() {
  return document.querySelector('div.period-bar')
}

/** Renders the Overview with a menu, while the contract loads until `release`. */
async function renderLoadingOverview() {
  const services = await seededServices()
  const { released, release } = releasable()
  const load = services.contracts.current
  vi.spyOn(services.contracts, 'current').mockImplementation(async () => {
    await released
    return load()
  })
  const onGoTo = vi.fn()
  render(<EntriesPage {...services} menu={menuFor('entries', onGoTo)} />)
  return { user: userEvent.setup(), onGoTo, release }
}

test('the Overview has the menu first in the period bar', async () => {
  const services = await seededServices()
  render(<EntriesPage {...services} menu={menuFor('entries')} />)
  await screen.findByRole('heading', { level: 2, name: 'Week 47' })

  expect(periodBar()?.firstElementChild).toHaveClass('menu-wrap')
  expect(periodBar()?.firstElementChild).toContainElement(icon())
})

test('the menu can be used while the contract is loading', async () => {
  const { user, onGoTo } = await renderLoadingOverview()

  expect(
    screen.queryByRole('heading', { level: 2, name: 'Week 47' }),
  ).not.toBeInTheDocument()
  expect(periodBar()?.firstElementChild).toContainElement(icon())
  await user.click(icon())
  await user.click(choice('Settings'))

  expect(onGoTo).toHaveBeenCalledExactlyOnceWith('settings')
})

test('an open menu stays open, in the same bar, when the contract is loaded', async () => {
  const { user, release } = await renderLoadingOverview()
  await user.click(icon())
  expectOpen()
  const bar = periodBar()
  const wrap = list().parentElement
  expect(bar).toBeInTheDocument()

  await release()
  await screen.findByRole('heading', { level: 2, name: 'Week 47' })

  expect(periodBar()).toBe(bar)
  expect(list().parentElement).toBe(wrap)
  expectOpen()
  expect(icon()).toHaveFocus()
})

test('focus stays on the menu icon when an arrow becomes disabled', async () => {
  const services = await seededServices()
  const { released, release } = releasable()
  const load = services.entries.firstDate
  let reloading = false
  vi.spyOn(services.entries, 'firstDate').mockImplementation(async () => {
    if (!reloading) return load()
    await released
    return undefined
  })
  render(<EntriesPage {...services} menu={menuFor('entries')} />)
  const user = userEvent.setup()
  const previous = () => screen.getByRole('button', { name: 'Previous week' })
  await waitFor(() => expect(previous()).toBeEnabled())
  // Adding an entry loads the first date again.
  reloading = true
  const row = within(await screen.findByRole('form', { name: 'Add entry' }))
  const start = row.getByRole('textbox', { name: 'Start' })
  await waitFor(() => expect(start).not.toHaveValue(''))
  await user.clear(start)
  await user.type(start, '09:00')
  await user.clear(row.getByRole('textbox', { name: 'End' }))
  await user.type(row.getByRole('textbox', { name: 'End' }), '10:00')
  await user.selectOptions(
    row.getByRole('combobox', { name: 'Label' }),
    'Client',
  )
  await user.click(row.getByRole('button', { name: 'Add' }))
  await screen.findByRole('button', { name: /^09:00–10:00/ })
  // The add row takes focus after an entry is added.
  await waitFor(() =>
    expect(
      screen
        .getByRole('form', { name: 'Add entry' })
        .contains(document.activeElement),
    ).toBe(true),
  )
  act(() => icon().focus())
  expect(previous()).toBeEnabled()

  await release()

  await waitFor(() => expect(previous()).toBeDisabled())
  expect(icon()).toHaveFocus()
})

test('Settings has a bar with the menu and the title', async () => {
  const services = await seededServices()
  render(<SettingsPage {...services} menu={menuFor('settings')} />)
  await screen.findByRole('form', { name: 'Add label' })

  const bar = document.querySelector<HTMLElement>('div.sticky-top.settings-bar')
  expect(bar).toContainElement(icon())
  expect(
    screen.getByRole('heading', { level: 2, name: 'Settings' }),
  ).toHaveClass('period-title')
  expect(bar).toContainElement(
    screen.getByRole('heading', { level: 2, name: 'Settings' }),
  )
})

test('the Overview without a menu has no menu', async () => {
  const services = await seededServices()
  render(<EntriesPage {...services} />)
  await screen.findByRole('heading', { level: 2, name: 'Week 47' })

  expect(document.querySelector('.menu-wrap')).toBeNull()
})

test('Settings without a menu has no menu and no bar', async () => {
  const services = await seededServices()
  render(<SettingsPage {...services} />)
  await screen.findByRole('form', { name: 'Add label' })

  expect(document.querySelector('.menu-wrap')).toBeNull()
  expect(document.querySelector('.settings-bar')).toBeNull()
})

test('an Escape that a field already handled leaves the list open and focus in the field', async () => {
  const user = userEvent.setup()
  render(
    <>
      <input
        aria-label="Field"
        onKeyDown={(event) => {
          if (event.key === 'Escape') event.preventDefault()
        }}
      />
      <Menu screens={screens} current="entries" onGoTo={vi.fn()} />
    </>,
  )
  await user.click(icon())
  act(() => screen.getByRole('textbox', { name: 'Field' }).focus())

  await user.keyboard('{Escape}')

  expectOpen()
  expect(screen.getByRole('textbox', { name: 'Field' })).toHaveFocus()
})

test('Escape in the Expected field keeps focus there while the menu is open', async () => {
  const services = await seededServices()
  const saved = await services.contracts.save({
    startDate: '2026-11-02',
    billingCycle: 'week',
    billableLimit: 36 * 60,
    startingBalance: 0,
  })
  if (!saved.ok) throw new Error(`could not seed contract: ${saved.error}`)
  render(<EntriesPage {...services} menu={menuFor('entries')} />)
  const user = userEvent.setup()
  const field = await screen.findByRole('textbox', { name: 'Expected' })
  await user.click(icon())
  // Focus without a click, which would close the menu.
  act(() => field.focus())
  await user.keyboard('3x')
  expectOpen()

  await user.keyboard('{Escape}')

  expect(field).toHaveFocus()
  expect(field).toHaveValue('')
})
