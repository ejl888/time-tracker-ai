import { useEffect, useId, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { Temporal } from 'temporal-polyfill'
import type { ContractService, Period } from '../domain/contracts.ts'
import { periodOf } from '../domain/contracts.ts'
import type { Contract } from '../domain/records.ts'
import { formatMinutes, parseHours } from '../domain/timeText.ts'
import {
  INVALID_HOURS_MESSAGE,
  contractErrorMessage,
} from '../settings/contractMessages.ts'
import {
  BEFORE_CONTRACT_MESSAGE,
  NO_CONTRACT_MESSAGE,
  expectedNote,
  periodTitle,
} from './summaryMessages.ts'
import './summary.css'

/** The contract and expected minutes loaded for a date. */
interface Loaded {
  date: Temporal.PlainDate
  contract: Contract | undefined
  expected: number | undefined
}

/** Loads the contract and the expected minutes of the period that contains the date. */
async function loadSummary(
  date: Temporal.PlainDate,
  contracts: ContractService,
): Promise<Loaded> {
  const contract = await contracts.current()
  if (!contract) return { date, contract, expected: undefined }
  const { start } = periodOf(date, contract.billingCycle)
  const expected = await contracts.expectedFor(contract, start.toString())
  return { date, contract, expected }
}

/** Whether the date is before the contract start. */
function isBeforeStart(date: Temporal.PlainDate, contract: Contract): boolean {
  return Temporal.PlainDate.compare(date, contract.startDate) < 0
}

/** The summary bar above the day: the period of the day and its expected billable hours. */
export function PeriodSummary({
  contracts,
  date,
}: {
  contracts: ContractService
  date: Temporal.PlainDate
}) {
  const [loaded, setLoaded] = useState<Loaded>()

  useEffect(() => {
    let current = true
    void loadSummary(date, contracts).then((summary) => {
      if (current) setLoaded(summary)
    })
    return () => {
      current = false
    }
  }, [date, contracts])

  const shown = loaded?.date.equals(date) ? loaded : undefined

  return (
    <section className="summary" aria-label="Period summary">
      {shown && <SummaryContent contracts={contracts} loaded={shown} />}
    </section>
  )
}

/** The note without a contract or before its start, else the period with its Expected metric. */
function SummaryContent({
  contracts,
  loaded: { date, contract, expected },
}: {
  contracts: ContractService
  loaded: Loaded
}) {
  if (!contract) return <p className="hint">{NO_CONTRACT_MESSAGE}</p>
  if (isBeforeStart(date, contract)) {
    return <p className="hint">{BEFORE_CONTRACT_MESSAGE}</p>
  }
  const period = periodOf(date, contract.billingCycle)
  const { title, sub } = periodTitle(period, contract.billingCycle)
  return (
    <>
      <div className="ptitle">
        <span className="period-name">{title}</span>
        <span className="period-sub">{sub}</span>
      </div>
      <ExpectedMetric
        key={period.start.toString()}
        contracts={contracts}
        contract={contract}
        period={period}
        stored={expected}
      />
    </>
  )
}

/** The text an expected value is shown as; empty when none is entered. */
function textOf(expected: number | undefined): string {
  return expected === undefined ? '' : formatMinutes(expected)
}

/** The Expected field of a period, saved when it is left or Enter is pressed. */
function ExpectedMetric({
  contracts,
  contract,
  period,
  stored,
}: {
  contracts: ContractService
  contract: Contract
  period: Period
  /** The expected minutes stored when the period was loaded. */
  stored: number | undefined
}) {
  const id = useId()
  const [saved, setSaved] = useState(stored)
  const [text, setText] = useState(() => textOf(stored))
  const [error, setError] = useState<string>()

  const typed = text.trim() === '' ? undefined : parseHours(text)
  // The note follows what is typed; while that is not valid, it follows the saved value.
  const shownValue = text.trim() === '' || typed !== undefined ? typed : saved

  async function save() {
    if (text.trim() !== '' && typed === undefined) {
      setError(INVALID_HOURS_MESSAGE)
      return
    }
    const result = await contracts.setExpected(
      contract,
      period.start.toString(),
      typed,
    )
    if (!result.ok) {
      setError(contractErrorMessage(result.error))
      return
    }
    setSaved(typed)
    setText(textOf(typed))
  }

  function saveOnEnter(event: KeyboardEvent<HTMLInputElement>) {
    // Leaving the field saves it, so Enter only leaves it.
    if (event.key === 'Enter') event.currentTarget.blur()
  }

  return (
    <div className="metric">
      <label className="k" htmlFor={id}>
        Expected
      </label>
      <input
        className="exp-input"
        id={id}
        type="text"
        inputMode="decimal"
        placeholder="36"
        value={text}
        onChange={(e) => {
          setText(e.target.value)
          setError(undefined)
        }}
        onBlur={() => void save()}
        onKeyDown={saveOnEnter}
      />
      {error ? (
        <span className="n err" role="alert">
          {error}
        </span>
      ) : (
        <span className="n">
          {expectedNote(
            contract.billingCycle,
            contract.billableLimit,
            shownValue,
          )}
        </span>
      )}
    </div>
  )
}
