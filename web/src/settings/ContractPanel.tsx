import { useEffect, useId, useState } from 'react'
import type { FormEvent } from 'react'
import type { Clock } from '../domain/clock.ts'
import type {
  BillingCycle,
  ContractFields,
  ContractService,
} from '../domain/contracts.ts'
import { defaultContract, defaultLimit } from '../domain/contracts.ts'
import { todayIn } from '../domain/entries.ts'
import {
  formatMinutes,
  formatSignedMinutes,
  parseHours,
  parseSignedHours,
} from '../domain/timeText.ts'
import {
  INVALID_HOURS_MESSAGE,
  LOCKED_MESSAGE,
  contractErrorMessage,
} from './contractMessages.ts'

/** The form's values as the user sees and edits them. */
interface Draft {
  cycle: BillingCycle
  limit: string
  start: string
  balance: string
}

type Message = { kind: 'error' | 'saved'; text: string }

const CYCLES: { cycle: BillingCycle; title: string }[] = [
  { cycle: 'week', title: 'Week' },
  { cycle: 'month', title: 'Month' },
]

/** The form for a saved or default contract. */
function draftOf(contract: ContractFields): Draft {
  return {
    cycle: contract.billingCycle,
    limit: formatMinutes(contract.billableLimit),
    start: contract.startDate,
    balance: formatSignedMinutes(contract.startingBalance),
  }
}

/** The contract fields of the draft, or the message why they are not valid. */
function fieldsOf(draft: Draft): ContractFields | string {
  const billableLimit = parseHours(draft.limit)
  const startingBalance = parseSignedHours(draft.balance)
  if (billableLimit === undefined || startingBalance === undefined) {
    return INVALID_HOURS_MESSAGE
  }
  return {
    billingCycle: draft.cycle,
    billableLimit,
    startDate: draft.start,
    startingBalance,
  }
}

/** Settings → Contract: billing cycle, billable limit, start and starting balance. */
export function ContractPanel({
  contracts,
  clock,
  timeZone,
}: {
  contracts: ContractService
  clock: Clock
  timeZone: string
}) {
  const id = useId()
  // Undefined until the contract and its lock have loaded.
  const [draft, setDraft] = useState<Draft>()
  const [locked, setLocked] = useState(false)
  const [message, setMessage] = useState<Message>()

  useEffect(() => {
    let current = true
    void (async () => {
      const contract = await contracts.current()
      const isLocked = contract ? await contracts.isLocked(contract) : false
      if (!current) return
      const today = todayIn(clock.now(), timeZone)
      setDraft(draftOf(contract ?? defaultContract(today)))
      setLocked(isLocked)
    })()
    return () => {
      current = false
    }
  }, [contracts, clock, timeZone])

  function change(fields: Partial<Draft>) {
    setDraft((previous) => previous && { ...previous, ...fields })
    setMessage(undefined)
  }

  /** Another cycle comes with its own default limit. */
  function chooseCycle(cycle: BillingCycle) {
    if (cycle === draft?.cycle) return
    change({ cycle, limit: formatMinutes(defaultLimit(cycle)) })
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!draft) return
    const fields = fieldsOf(draft)
    if (typeof fields === 'string') {
      setMessage({ kind: 'error', text: fields })
      return
    }
    const result = await contracts.save(fields)
    if (!result.ok) {
      setMessage({ kind: 'error', text: contractErrorMessage(result.error) })
      return
    }
    setDraft(draftOf(result.value))
    setLocked(await contracts.isLocked(result.value))
    setMessage({ kind: 'saved', text: 'Contract saved' })
  }

  const intro = (
    <>
      <h2>Contract</h2>
      <p className="hint">
        These settings drive how billed hours and the balance are calculated.
      </p>
    </>
  )
  if (!draft) return <section className="panel">{intro}</section>

  return (
    <section className="panel">
      {intro}
      <form className="contract-form" onSubmit={save}>
        <div className="fields">
          <div className="field">
            <span className="lab" id={`${id}-cycle`}>
              Billing cycle
            </span>
            <div className="seg" role="group" aria-labelledby={`${id}-cycle`}>
              {CYCLES.map(({ cycle, title }) => (
                <button
                  key={cycle}
                  type="button"
                  aria-pressed={draft.cycle === cycle}
                  disabled={locked}
                  onClick={() => chooseCycle(cycle)}
                >
                  {title}
                </button>
              ))}
            </div>
            <span className="help">
              With a monthly cycle everything is per month.
            </span>
          </div>
          <div className="field">
            <label htmlFor={`${id}-limit`}>
              Billable limit per {draft.cycle}
            </label>
            <input
              type="text"
              id={`${id}-limit`}
              value={draft.limit}
              disabled={locked}
              onChange={(e) => change({ limit: e.target.value })}
            />
            <span className="help">
              The most you may bill in one {draft.cycle}.
            </span>
          </div>
          <div className="field">
            <label htmlFor={`${id}-start`}>Contract start</label>
            <input
              type="date"
              id={`${id}-start`}
              value={draft.start}
              disabled={locked}
              onChange={(e) => change({ start: e.target.value })}
            />
          </div>
          <div className="field">
            <label htmlFor={`${id}-balance`}>Starting balance</label>
            <input
              type="text"
              id={`${id}-balance`}
              value={draft.balance}
              onChange={(e) => change({ balance: e.target.value })}
            />
            <span className="help">
              Use when you start halfway through a project. + is built up, − is
              still to work.
            </span>
          </div>
        </div>
        {locked && <p className="help">{LOCKED_MESSAGE}</p>}
        <button className="btn primary" type="submit">
          Save contract
        </button>
        {message?.kind === 'error' && (
          <p className="msg err" role="alert">
            {message.text}
          </p>
        )}
        {message?.kind === 'saved' && (
          <p className="msg" role="status">
            {message.text}
          </p>
        )}
      </form>
    </section>
  )
}
