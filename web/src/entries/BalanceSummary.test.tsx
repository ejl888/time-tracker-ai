import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Temporal } from 'temporal-polyfill'
import { expect, test, vi } from 'vitest'
import { fixedClock } from '../domain/clock.ts'
import {
  type ContractFields,
  createContractService,
} from '../domain/contracts.ts'
import { createEntryService } from '../domain/entries.ts'
import type { EntryService } from '../domain/entries.ts'
import { createLabelService } from '../domain/labels.ts'
import type {
  Contract,
  Entry,
  ExpectedHours,
  Label,
} from '../domain/records.ts'
import { InMemoryRepository } from '../domain/repository.ts'
import { EntriesPage } from './EntriesPage.tsx'

// The balance and worked hours in the summary bar on the Entries page (US-08).

const timeZone = 'Europe/Amsterdam'

const weekly: ContractFields = {
  startDate: '2026-11-02',
  billingCycle: 'week',
  billableLimit: 36 * 60,
  startingBalance: 0,
}

const monthly: ContractFields = {
  startDate: '2026-10-01',
  billingCycle: 'month',
  billableLimit: 150 * 60,
  startingBalance: 0,
}

type LabelName = 'Client' | 'Admin'
type SeedEntry = [
  date: string,
  start: string,
  end: string,
  /** The billable Client when left out; Admin is not billable. */
  label?: LabelName,
]

interface Setup {
  /** Today in Amsterdam; the page opens on this day. Wed 25 Nov 2026 (week 48) by default. */
  today?: string
  /** The contract to save first; none when left out. */
  contract?: ContractFields
  /** Expected minutes to store first, by period start. */
  expected?: Record<string, number>
  entries?: SeedEntry[]
  /** The labels to delete after the entries are added. */
  deletedLabels?: LabelName[]
  /** Runs on the entry service after seeding, before the page renders. */
  prepare?: (entries: EntryService) => void
}

/** Renders the Entries page on in-memory services, today at noon in Amsterdam. */
async function renderPage({
  today = '2026-11-25',
  contract,
  expected = {},
  entries: seedEntries = [],
  deletedLabels = [],
  prepare,
}: Setup = {}) {
  const clock = fixedClock(
    Temporal.PlainDate.from(today)
      .toZonedDateTime({ timeZone, plainTime: '12:00' })
      .toInstant(),
  )
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
  const ids = new Map<LabelName, string>()
  for (const name of ['Client', 'Admin'] as const) {
    const created = await labels.create(name, { billable: name === 'Client' })
    if (!created.ok) throw new Error(`could not seed label ${name}`)
    ids.set(name, created.value.id)
  }
  for (const [date, start, end, label = 'Client'] of seedEntries) {
    const added = await entries.add({
      date: Temporal.PlainDate.from(date),
      start: Temporal.PlainTime.from(start),
      end: Temporal.PlainTime.from(end),
      labelId: ids.get(label)!,
      description: '',
      timeZone,
    })
    if (!added.ok) throw new Error(`could not seed entry: ${added.error}`)
  }
  for (const name of deletedLabels) {
    const removed = await labels.remove(ids.get(name)!)
    if (!removed.ok) throw new Error(`could not delete label ${name}`)
  }
  if (contract) {
    const saved = await contracts.save(contract)
    if (!saved.ok) throw new Error(`could not seed contract: ${saved.error}`)
    for (const [periodStart, minutes] of Object.entries(expected)) {
      const set = await contracts.setExpected(saved.value, periodStart, minutes)
      if (!set.ok) throw new Error(`could not seed expected: ${set.error}`)
    }
  }
  prepare?.(entries)
  render(
    <EntriesPage
      entries={entries}
      labels={labels}
      contracts={contracts}
      clock={clock}
      timeZone={timeZone}
    />,
  )
  await screen.findByRole('heading', { name: 'Entries' })
  return { user: userEvent.setup() }
}

type User = ReturnType<typeof userEvent.setup>
type MetricName = 'Balance in' | 'Worked'

function summaryRegion() {
  return screen.getByRole('region', { name: 'Period summary' })
}

/** The parts of a metric in the summary, once it is shown. */
async function findMetric(name: MetricName) {
  const label = await within(summaryRegion()).findByText(name, {
    selector: 'span.k',
  })
  const metric = label.closest('div.metric')
  const value = metric?.querySelector('span.v')
  const note = metric?.querySelector('span.n')
  if (!value || !note) throw new Error(`${name} has no value or note`)
  return { label, value, note }
}

/** Waits until a metric shows the value. */
async function waitForValue(name: MetricName, value: string) {
  await waitFor(async () =>
    expect((await findMetric(name)).value.textContent).toBe(value),
  )
}

/** The Expected field, once it is shown. */
async function findExpected() {
  return within(summaryRegion()).findByRole<HTMLInputElement>('textbox', {
    name: 'Expected',
  })
}

/** Waits until the summary shows the period with this title, e.g. "Week 48". */
async function findPeriod(title: string) {
  await within(summaryRegion()).findByRole('heading', { name: title })
}

/** Adds an entry to the shown day through the add row. */
async function addEntry(
  user: User,
  start: string,
  end: string,
  label: LabelName = 'Client',
) {
  const form = within(await screen.findByRole('form', { name: 'Add entry' }))
  for (const [name, text] of [
    ['Start', start],
    ['End', end],
  ]) {
    await user.clear(form.getByRole('textbox', { name }))
    await user.type(form.getByRole('textbox', { name }), text)
  }
  await user.selectOptions(
    form.getByRole('combobox', { name: 'Label' }),
    within(form.getByRole('combobox', { name: 'Label' })).getByRole('option', {
      name: label,
    }),
  )
  await user.click(form.getByRole('button', { name: 'Add' }))
  await screen.findByRole('button', { name: new RegExp(`^${start}–${end}`) })
}

/** Opens the editor of the entry that starts at this time on the shown day. */
async function openEntry(user: User, start: string) {
  await user.click(
    await screen.findByRole('button', { name: new RegExp(`^${start}–`) }),
  )
  return within(await screen.findByRole('form', { name: 'Edit entry' }))
}

/** Changes the end of the entry that starts at this time on the shown day. */
async function changeEnd(user: User, start: string, end: string) {
  const form = await openEntry(user, start)
  await user.clear(form.getByRole('textbox', { name: 'End' }))
  await user.type(form.getByRole('textbox', { name: 'End' }), end)
  await user.click(form.getByRole('button', { name: 'Save' }))
  await screen.findByRole('button', { name: new RegExp(`^${start}–${end}`) })
}

async function deleteEntry(user: User, start: string) {
  const form = await openEntry(user, start)
  await user.click(form.getByRole('button', { name: 'Delete' }))
  await user.click(form.getByRole('button', { name: 'Click again to delete' }))
  await waitFor(() =>
    expect(
      screen.queryByRole('form', { name: 'Edit entry' }),
    ).not.toBeInTheDocument(),
  )
}

async function goTo(user: User, button: string, heading: string) {
  await user.click(screen.getByRole('button', { name: button }))
  await screen.findByRole('heading', { name: heading })
}

/**
 * Makes the loads of `entries.until` controllable. While `holding` is true, a load reads its
 * entries at once but only resolves after `release`.
 */
function holdableLoads() {
  let release!: () => void
  const released = new Promise<void>((resolve) => {
    release = resolve
  })
  const loads = {
    holding: false,
    /** How many loads were held. */
    held: 0,
    release: () =>
      act(async () => {
        release()
        // Lets the steps after the load run too.
        await new Promise((resolve) => setTimeout(resolve, 20))
      }),
    prepare(entries: EntryService) {
      const load = entries.until
      vi.spyOn(entries, 'until').mockImplementation(async (date) => {
        const hold = loads.holding
        if (hold) loads.held += 1
        const loaded = await load(date)
        if (hold) await released
        return loaded
      })
    },
  }
  return loads
}

/** Watches whether a metric or the Expected field ever leaves the summary; call it to stop and get the answer. */
function watchForGaps() {
  const region = summaryRegion()
  let gap = false
  const observer = new MutationObserver(() => {
    const shown = within(region)
    if (
      !shown.queryByText('Balance in') ||
      !shown.queryByText('Worked') ||
      !shown.queryByRole('textbox', { name: 'Expected' })
    ) {
      gap = true
    }
  })
  observer.observe(region, { childList: true, subtree: true })
  return () => {
    observer.disconnect()
    return gap
  }
}

test('shows Balance in, Expected and Worked, in that order', async () => {
  await renderPage({ contract: weekly })

  await findMetric('Balance in')
  const labels = Array.from(
    summaryRegion().querySelectorAll('.metric .k'),
    (label) => label.textContent,
  )
  expect(labels.slice(0, 3)).toEqual(['Balance in', 'Expected', 'Worked'])
})

test.each([
  ['positive', 5 * 60, '+5:00', { pos: true, neg: false }],
  ['negative', -150, '-2:30', { pos: false, neg: true }],
  ['zero', 0, '0:00', { pos: false, neg: false }],
])(
  'carries a %s starting balance into the first period',
  async (_name, startingBalance, text, classes) => {
    await renderPage({
      contract: { ...weekly, startDate: '2026-11-23', startingBalance },
      entries: [['2026-11-25', '09:00', '17:00']],
    })

    const { value } = await findMetric('Balance in')
    expect(value.textContent).toBe(text)
    expect(value.classList.contains('pos')).toBe(classes.pos)
    expect(value.classList.contains('neg')).toBe(classes.neg)
  },
)

test.each([
  ['more worked than billed', 6 * 60, 36 * 60, '+2:00'],
  ['less worked than billed', 10 * 60, 36 * 60, '-2:00'],
  ['expected hours capped at the limit', 10 * 60, 6 * 60, '+2:00'],
  ['no hours expected', 0, 36 * 60, '+8:00'],
])(
  'carries the balance of an earlier week with %s',
  async (_name, expected, billableLimit, text) => {
    await renderPage({
      contract: { ...weekly, billableLimit },
      expected: { '2026-11-16': expected },
      entries: [['2026-11-18', '09:00', '17:00']],
    })

    const { value } = await findMetric('Balance in')
    expect(value.textContent).toBe(text)
    expect(value).toHaveClass(text.startsWith('+') ? 'pos' : 'neg')
  },
)

test('adds up the starting balance and all earlier weeks, but not the shown week', async () => {
  await renderPage({
    contract: { ...weekly, startingBalance: 60 },
    // Week 46 bills nothing, as no hours are expected.
    expected: {
      '2026-11-02': 4 * 60,
      '2026-11-16': 10 * 60,
      '2026-11-23': 36 * 60,
    },
    entries: [
      ['2026-11-04', '09:00', '17:00'],
      ['2026-11-11', '09:00', '10:30'],
      ['2026-11-18', '09:00', '17:00'],
      ['2026-11-18', '17:00', '18:00', 'Admin'],
      ['2026-11-23', '09:00', '17:00'],
    ],
  })

  // 1:00 + (8:00 - 4:00) + 1:30 + (8:00 - 10:00)
  await waitForValue('Balance in', '+4:30')
})

test('says the balance comes from earlier weeks', async () => {
  await renderPage({ contract: weekly })

  const { label, note } = await findMetric('Balance in')
  expect(label).toHaveAttribute(
    'title',
    'Balance carried in from earlier weeks',
  )
  expect(note.textContent).toBe('From earlier weeks')
})

test('shows the balance and worked hours of a month, from earlier months', async () => {
  await renderPage({
    contract: monthly,
    expected: { '2026-10-01': 4 * 60 },
    entries: [
      ['2026-10-31', '09:00', '17:00'],
      ['2026-11-01', '09:00', '10:00'],
      ['2026-11-25', '09:00', '10:30'],
    ],
  })

  const { label, value, note } = await findMetric('Balance in')
  expect(value.textContent).toBe('+4:00')
  expect(label).toHaveAttribute(
    'title',
    'Balance carried in from earlier months',
  )
  expect(note.textContent).toBe('From earlier months')
  expect((await findMetric('Worked')).value.textContent).toBe('2:30')
})

test('shows 0:00 worked without entries', async () => {
  await renderPage({ contract: weekly })

  const { value, note } = await findMetric('Worked')
  expect(value.textContent).toBe('0:00')
  expect(note.textContent).toBe('Billable labels only')
})

test('counts all days of the week as worked, also after the shown day, and no other weeks', async () => {
  const { user } = await renderPage({
    contract: weekly,
    entries: [
      ['2026-11-22', '09:00', '17:00'],
      ['2026-11-23', '09:00', '10:00'],
      ['2026-11-24', '09:00', '11:00'],
      ['2026-11-25', '09:00', '13:15'],
    ],
  })

  await waitForValue('Worked', '7:15')
  await goTo(user, 'Previous day', 'Tuesday 24 November 2026')
  await goTo(user, 'Previous day', 'Monday 23 November 2026')
  await waitForValue('Worked', '7:15')

  await goTo(user, 'Previous day', 'Sunday 22 November 2026')
  await findPeriod('Week 47')
  await waitForValue('Worked', '8:00')
  await waitForValue('Balance in', '0:00')
})

test('shows non-billable hours in the note of Worked', async () => {
  await renderPage({
    contract: weekly,
    entries: [
      ['2026-11-18', '13:00', '15:00', 'Admin'],
      ['2026-11-24', '09:00', '11:00'],
      ['2026-11-24', '13:00', '13:30', 'Admin'],
      ['2026-11-25', '13:00', '13:30', 'Admin'],
    ],
  })

  const { value, note } = await findMetric('Worked')
  expect(value.textContent).toBe('2:00')
  expect(note.textContent).toBe('+ 1:00 non-billable')
})

test('leaves out entries before a midweek contract start', async () => {
  await renderPage({
    contract: { ...weekly, startDate: '2026-11-24', startingBalance: 30 },
    entries: [
      ['2026-11-18', '09:00', '17:00'],
      ['2026-11-23', '09:00', '17:00'],
      ['2026-11-23', '17:00', '18:00', 'Admin'],
      ['2026-11-24', '09:00', '10:00'],
      ['2026-11-25', '09:00', '11:00'],
    ],
  })

  const { value, note } = await findMetric('Worked')
  expect(value.textContent).toBe('3:00')
  expect(note.textContent).toBe('Billable labels only')
  expect((await findMetric('Balance in')).value.textContent).toBe('+0:30')
})

test('leaves earlier days of a midweek start week out of the balance of the next week', async () => {
  await renderPage({
    contract: { ...weekly, startDate: '2026-11-18' },
    expected: { '2026-11-16': 60 },
    entries: [
      ['2026-11-17', '09:00', '17:00'],
      ['2026-11-18', '09:00', '13:00'],
    ],
  })

  await waitForValue('Balance in', '+3:00')
})

test('counts entries with a deleted label with its billable setting', async () => {
  await renderPage({
    contract: weekly,
    entries: [
      ['2026-11-18', '09:00', '12:00'],
      ['2026-11-18', '12:00', '13:00', 'Admin'],
      ['2026-11-25', '09:00', '11:00'],
      ['2026-11-25', '11:00', '12:30', 'Admin'],
    ],
    deletedLabels: ['Client', 'Admin'],
  })

  const { value, note } = await findMetric('Worked')
  expect(value.textContent).toBe('2:00')
  expect(note.textContent).toBe('+ 1:30 non-billable')
  expect((await findMetric('Balance in')).value.textContent).toBe('+3:00')
})

test('updates Worked after an entry is added, changed and deleted, keeping the typed Expected text', async () => {
  const { user } = await renderPage({
    contract: weekly,
    entries: [['2026-11-25', '09:00', '10:00']],
  })
  await waitForValue('Worked', '1:00')
  const field = await findExpected()
  // Text that is not valid stays unsaved when the field is left.
  await user.type(field, 'abc')
  const stopWatching = watchForGaps()

  await addEntry(user, '10:00', '12:00')
  await waitForValue('Worked', '3:00')

  await addEntry(user, '13:00', '13:45', 'Admin')
  await waitFor(async () =>
    expect((await findMetric('Worked')).note.textContent).toBe(
      '+ 0:45 non-billable',
    ),
  )
  await waitForValue('Worked', '3:00')

  await changeEnd(user, '09:00', '09:30')
  await waitForValue('Worked', '2:30')

  await deleteEntry(user, '10:00')
  await waitForValue('Worked', '0:30')

  await deleteEntry(user, '13:00')
  await waitFor(async () =>
    expect((await findMetric('Worked')).note.textContent).toBe(
      'Billable labels only',
    ),
  )

  expect(stopWatching()).toBe(false)
  expect(await findExpected()).toBe(field)
  expect(field).toHaveValue('abc')
})

test('keeps the shown values until the updated ones are loaded', async () => {
  const loads = holdableLoads()
  const { user } = await renderPage({
    contract: weekly,
    entries: [['2026-11-25', '09:00', '10:00']],
    prepare: loads.prepare,
  })
  await waitForValue('Worked', '1:00')
  const field = await findExpected()
  const stopWatching = watchForGaps()

  loads.holding = true
  await addEntry(user, '10:00', '12:00')
  await waitFor(() => expect(loads.held).toBeGreaterThan(0))
  expect((await findMetric('Worked')).value.textContent).toBe('1:00')

  await loads.release()
  await waitForValue('Worked', '3:00')
  expect(stopWatching()).toBe(false)
  expect(await findExpected()).toBe(field)
})

test("shows the other week's values and carries a change there into the balance", async () => {
  const { user } = await renderPage({
    today: '2026-11-23',
    contract: weekly,
    expected: { '2026-11-09': 60, '2026-11-16': 4 * 60 },
    entries: [
      ['2026-11-11', '09:00', '12:00'],
      ['2026-11-22', '09:00', '17:00'],
      ['2026-11-23', '09:00', '10:00'],
    ],
  })
  await waitForValue('Balance in', '+6:00')
  await waitForValue('Worked', '1:00')

  await goTo(user, 'Previous day', 'Sunday 22 November 2026')
  await findPeriod('Week 47')
  await waitForValue('Balance in', '+2:00')
  await waitForValue('Worked', '8:00')

  await changeEnd(user, '09:00', '18:00')
  await waitForValue('Worked', '9:00')
  await waitForValue('Balance in', '+2:00')

  await goTo(user, 'Next day', 'Monday 23 November 2026')
  await findPeriod('Week 48')
  await waitForValue('Balance in', '+7:00')
  await waitForValue('Worked', '1:00')
})

test('a load that finishes late does not overwrite newer values', async () => {
  const loads = holdableLoads()
  loads.holding = true
  const { user } = await renderPage({
    contract: weekly,
    entries: [['2026-11-25', '09:00', '10:00']],
    prepare: loads.prepare,
  })
  await waitFor(() => expect(loads.held).toBeGreaterThan(0))

  loads.holding = false
  await addEntry(user, '10:00', '12:00')
  await waitForValue('Worked', '3:00')

  await loads.release()
  await waitForValue('Worked', '3:00')
})

test('a slow load after one change does not overwrite the values after a later change', async () => {
  const loads = holdableLoads()
  const { user } = await renderPage({
    contract: weekly,
    entries: [['2026-11-25', '09:00', '10:00']],
    prepare: loads.prepare,
  })
  await waitForValue('Worked', '1:00')

  loads.holding = true
  await addEntry(user, '10:00', '12:00')
  await waitFor(() => expect(loads.held).toBeGreaterThan(0))
  loads.holding = false
  await addEntry(user, '13:00', '17:00')
  await waitForValue('Worked', '7:00')

  await loads.release()
  await waitForValue('Worked', '7:00')
})

test('a slow load of another week does not overwrite the values of the shown week', async () => {
  const loads = holdableLoads()
  const { user } = await renderPage({
    today: '2026-11-23',
    contract: weekly,
    entries: [
      ['2026-11-22', '09:00', '17:00'],
      ['2026-11-23', '09:00', '10:00'],
    ],
    prepare: loads.prepare,
  })
  await waitForValue('Worked', '1:00')

  loads.holding = true
  await goTo(user, 'Previous day', 'Sunday 22 November 2026')
  await waitFor(() => expect(loads.held).toBeGreaterThan(0))
  loads.holding = false
  await goTo(user, 'Next day', 'Monday 23 November 2026')
  await findPeriod('Week 48')
  await waitForValue('Worked', '1:00')

  await loads.release()
  await findPeriod('Week 48')
  await waitForValue('Worked', '1:00')
  await waitForValue('Balance in', '+8:00')
})

test('keeps the metrics shown when moving to another day in the same week', async () => {
  const { user } = await renderPage({
    contract: weekly,
    entries: [
      ['2026-11-18', '09:00', '17:00'],
      ['2026-11-25', '09:00', '10:00'],
    ],
  })
  await waitForValue('Worked', '1:00')
  const stopWatching = watchForGaps()

  await goTo(user, 'Previous day', 'Tuesday 24 November 2026')

  await waitForValue('Worked', '1:00')
  await waitForValue('Balance in', '+8:00')
  expect(stopWatching()).toBe(false)
})

test('shows no metrics without a contract', async () => {
  await renderPage({ entries: [['2026-11-25', '09:00', '10:00']] })

  await within(summaryRegion()).findByText('Set up your contract in Settings')
  expect(summaryRegion().querySelector('.metric')).toBeNull()
})

test('shows no metrics before the contract start', async () => {
  const { user } = await renderPage({
    today: '2026-11-23',
    contract: { ...weekly, startDate: '2026-11-23' },
    entries: [['2026-11-22', '09:00', '10:00']],
  })
  await findMetric('Balance in')

  await goTo(user, 'Previous day', 'Sunday 22 November 2026')

  await within(summaryRegion()).findByText('Before your contract starts')
  expect(summaryRegion().querySelector('.metric')).toBeNull()
})
