import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Temporal } from 'temporal-polyfill'
import { expect, test, vi } from 'vitest'
import { fixedClock } from '../domain/clock.ts'
import {
  type ContractFields,
  createContractService,
} from '../domain/contracts.ts'
import type { Contract, ExpectedHours } from '../domain/records.ts'
import { InMemoryRepository } from '../domain/repository.ts'
import { ContractPanel } from './ContractPanel.tsx'

const timeZone = 'Europe/Amsterdam'
// Wednesday 25 November 2026, 10:00 in Amsterdam; that week starts on Monday 23 November.
const clock = fixedClock(Temporal.Instant.from('2026-11-25T09:00:00Z'))

const savedContract: ContractFields = {
  startDate: '2026-11-02',
  billingCycle: 'week',
  billableLimit: 32 * 60,
  startingBalance: 0,
}

/**
 * Renders the panel on an in-memory contract service. With `seed` a contract
 * is saved first; with `expectedIn` it also gets expected hours for that
 * period start, which locks its cycle, start and limit.
 */
async function renderPanel(seed?: ContractFields, expectedIn?: string) {
  const contracts = createContractService(
    new InMemoryRepository<Contract>(),
    new InMemoryRepository<ExpectedHours>(),
    clock,
  )
  if (seed) {
    const saved = await contracts.save(seed)
    if (!saved.ok) throw new Error(`could not seed contract: ${saved.error}`)
    if (expectedIn) {
      const set = await contracts.setExpected(saved.value, expectedIn, 36 * 60)
      if (!set.ok) throw new Error(`could not seed expected: ${set.error}`)
    }
  }
  render(
    <ContractPanel contracts={contracts} clock={clock} timeZone={timeZone} />,
  )
  await screen.findByRole('heading', { name: 'Contract' })
  return { user: userEvent.setup(), contracts }
}

function cycleButton(name: 'Week' | 'Month') {
  const group = screen.getByRole('group', { name: 'Billing cycle' })
  return within(group).getByRole('button', { name })
}

function limitField(cycle: 'week' | 'month' = 'week') {
  return screen.getByRole('textbox', {
    name: `Billable limit per ${cycle}`,
  }) as HTMLInputElement
}

function startField() {
  return screen.getByLabelText('Contract start') as HTMLInputElement
}

function balanceField() {
  return screen.getByRole('textbox', {
    name: 'Starting balance',
  }) as HTMLInputElement
}

function saveButton() {
  return screen.getByRole('button', { name: 'Save contract' })
}

async function replace(
  user: ReturnType<typeof userEvent.setup>,
  field: HTMLElement,
  text: string,
) {
  await user.clear(field)
  await user.type(field, text)
}

test('shows the heading and the hint', async () => {
  await renderPanel()

  expect(
    screen.getByText(
      'These settings drive how billed hours and the balance are calculated.',
    ),
  ).toBeInTheDocument()
})

test('without a contract, shows the defaults and stores nothing', async () => {
  const { contracts } = await renderPanel()

  expect(await screen.findByDisplayValue('36:00')).toBe(limitField())
  expect(cycleButton('Week')).toHaveAttribute('aria-pressed', 'true')
  expect(cycleButton('Month')).toHaveAttribute('aria-pressed', 'false')
  expect(startField()).toHaveAttribute('type', 'date')
  expect(startField()).toHaveValue('2026-11-23')
  expect(balanceField()).toHaveValue('0:00')
  expect(await contracts.current()).toBeUndefined()
})

test('shows the help texts', async () => {
  await renderPanel()

  expect(
    screen.getByText('With a monthly cycle everything is per month.'),
  ).toBeInTheDocument()
  expect(
    screen.getByText('The most you may bill in one week.'),
  ).toBeInTheDocument()
  expect(
    screen.getByText(
      'Use when you start halfway through a project. + is built up, − is still to work.',
    ),
  ).toBeInTheDocument()
})

test('speaks of a month when the monthly cycle is chosen', async () => {
  const { user } = await renderPanel()

  await user.click(cycleButton('Month'))

  expect(cycleButton('Month')).toHaveAttribute('aria-pressed', 'true')
  expect(cycleButton('Week')).toHaveAttribute('aria-pressed', 'false')
  expect(limitField('month')).toBeInTheDocument()
  expect(
    screen.getByText('The most you may bill in one month.'),
  ).toBeInTheDocument()
})

test('saves the defaults as the contract', async () => {
  const { user, contracts } = await renderPanel()

  await user.click(saveButton())

  expect(await screen.findByRole('status')).toHaveTextContent('Contract saved')
  expect(await contracts.current()).toEqual(
    expect.objectContaining({
      billingCycle: 'week',
      billableLimit: 36 * 60,
      startDate: '2026-11-23',
      startingBalance: 0,
      endDate: null,
    }),
  )
})

test('saves the entered values and shows them afterwards', async () => {
  const { user, contracts } = await renderPanel()

  await user.click(cycleButton('Month'))
  await replace(user, limitField('month'), '140')
  await replace(user, startField(), '2026-11-01')
  await replace(user, balanceField(), '5')
  await user.click(saveButton())

  expect(await screen.findByRole('status')).toHaveTextContent('Contract saved')
  expect(await contracts.current()).toEqual(
    expect.objectContaining({
      billingCycle: 'month',
      billableLimit: 140 * 60,
      startDate: '2026-11-01',
      startingBalance: 5 * 60,
    }),
  )
  expect(cycleButton('Month')).toHaveAttribute('aria-pressed', 'true')
  expect(limitField('month')).toHaveValue('140:00')
  expect(startField()).toHaveValue('2026-11-01')
  expect(balanceField()).toHaveValue('+5:00')
})

test('shows a saved contract', async () => {
  await renderPanel({ ...savedContract, startingBalance: -90 })

  expect(await screen.findByDisplayValue('32:00')).toBe(limitField())
  expect(cycleButton('Week')).toHaveAttribute('aria-pressed', 'true')
  expect(startField()).toHaveValue('2026-11-02')
  expect(balanceField()).toHaveValue('-1:30')
})

test('changes a saved contract', async () => {
  const { user, contracts } = await renderPanel(savedContract)
  await screen.findByDisplayValue('32:00')

  await replace(user, limitField(), '36:00')
  await user.click(saveButton())

  expect(await screen.findByRole('status')).toHaveTextContent('Contract saved')
  expect(await contracts.current()).toEqual(
    expect.objectContaining({ billableLimit: 36 * 60 }),
  )
})

test('rejects a billable limit of 0', async () => {
  const { user, contracts } = await renderPanel()

  await replace(user, limitField(), '0')
  await user.click(saveButton())

  expect(await screen.findByRole('alert')).toHaveTextContent(
    'The billable limit must be more than 0:00',
  )
  expect(screen.queryByRole('status')).not.toBeInTheDocument()
  expect(await contracts.current()).toBeUndefined()
})

test.each(['36.5', 'abc'])('rejects %s as billable limit', async (text) => {
  const { user, contracts } = await renderPanel()

  await replace(user, limitField(), text)
  await user.click(saveButton())

  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Use hours like 36 or 36:00',
  )
  expect(await contracts.current()).toBeUndefined()
})

test('rejects a starting balance that is not in hours', async () => {
  const { user, contracts } = await renderPanel()

  await replace(user, balanceField(), 'abc')
  await user.click(saveButton())

  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Use hours like 36 or 36:00',
  )
  expect(await contracts.current()).toBeUndefined()
})

test('locks cycle, limit and start once expected hours are entered', async () => {
  await renderPanel(savedContract, '2026-11-23')
  await screen.findByDisplayValue('32:00')

  expect(cycleButton('Week')).toBeDisabled()
  expect(cycleButton('Month')).toBeDisabled()
  expect(limitField()).toBeDisabled()
  expect(startField()).toBeDisabled()
  expect(balanceField()).toBeEnabled()
  expect(
    screen.getByText('Locked: expected hours are entered for this contract'),
  ).toBeInTheDocument()
})

test('does not lock a contract without expected hours', async () => {
  await renderPanel(savedContract)
  await screen.findByDisplayValue('32:00')

  expect(cycleButton('Week')).toBeEnabled()
  expect(limitField()).toBeEnabled()
  expect(startField()).toBeEnabled()
  expect(
    screen.queryByText('Locked: expected hours are entered for this contract'),
  ).not.toBeInTheDocument()
})

test('still saves the starting balance of a locked contract', async () => {
  const { user, contracts } = await renderPanel(savedContract, '2026-11-23')
  await screen.findByDisplayValue('32:00')

  await replace(user, balanceField(), '-2:00')
  await user.click(saveButton())

  expect(await screen.findByRole('status')).toHaveTextContent('Contract saved')
  expect(await contracts.current()).toEqual(
    expect.objectContaining({ billableLimit: 32 * 60, startingBalance: -120 }),
  )
  expect(balanceField()).toHaveValue('-2:00')
})

test('asks for a start date when Contract start is cleared and stores nothing', async () => {
  const { user, contracts } = await renderPanel()

  await user.clear(startField())
  await user.click(saveButton())

  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Enter a start date',
  )
  expect(screen.queryByRole('status')).not.toBeInTheDocument()
  expect(await contracts.current()).toBeUndefined()
})

/** A promise that is resolved by hand. */
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

/** A service with a stored contract, for tests that hold its answers pending. */
async function storedContract(fields: ContractFields) {
  const contracts = createContractService(
    new InMemoryRepository<Contract>(),
    new InMemoryRepository<ExpectedHours>(),
    clock,
  )
  const saved = await contracts.save(fields)
  if (!saved.ok) throw new Error(`could not seed contract: ${saved.error}`)
  return { contracts, contract: saved.value }
}

test('shows no contract fields until the stored contract has loaded', async () => {
  const { contracts, contract } = await storedContract({
    ...savedContract,
    billableLimit: 40 * 60,
  })
  const loading = deferred<Contract | undefined>()
  const current = vi
    .spyOn(contracts, 'current')
    .mockReturnValue(loading.promise)

  render(
    <ContractPanel contracts={contracts} clock={clock} timeZone={timeZone} />,
  )
  await waitFor(() => expect(current).toHaveBeenCalled())

  expect(screen.queryAllByRole('textbox')).toHaveLength(0)
  expect(screen.queryByLabelText('Contract start')).not.toBeInTheDocument()
  expect(
    screen.queryByRole('group', { name: 'Billing cycle' }),
  ).not.toBeInTheDocument()

  await act(async () => loading.resolve(contract))

  expect(await screen.findByDisplayValue('40:00')).toBe(limitField())
})

test('never enables the locked fields while the lock is still loading', async () => {
  const { contracts } = await storedContract(savedContract)
  const loading = deferred<boolean>()
  const isLocked = vi
    .spyOn(contracts, 'isLocked')
    .mockReturnValue(loading.promise)

  render(
    <ContractPanel contracts={contracts} clock={clock} timeZone={timeZone} />,
  )
  await waitFor(() => expect(isLocked).toHaveBeenCalled())
  // Lets any update that does not wait for the lock show up.
  await act(async () => {})

  for (const field of [
    screen.queryByRole('textbox', { name: /^Billable limit/ }),
    screen.queryByLabelText('Contract start'),
    screen.queryByRole('button', { name: 'Week' }),
    screen.queryByRole('button', { name: 'Month' }),
  ]) {
    if (field) expect(field).toBeDisabled()
  }

  await act(async () => loading.resolve(true))

  expect(await screen.findByDisplayValue('32:00')).toBe(limitField())
  expect(limitField()).toBeDisabled()
  expect(startField()).toBeDisabled()
  expect(cycleButton('Week')).toBeDisabled()
  expect(cycleButton('Month')).toBeDisabled()
})
