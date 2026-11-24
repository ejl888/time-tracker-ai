import { useEffect, useId, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { Temporal } from 'temporal-polyfill'
import type { ContractService, Period } from '../domain/contracts.ts'
import { coversPeriod, periodOf } from '../domain/contracts.ts'
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

/** The expected minutes loaded for the period that starts on `periodStart`. */
interface LoadedExpected {
  periodStart: string
  expected: number | undefined
}

/** The summary bar above the day: the period of the day and its expected billable hours. */
export function PeriodSummary({
  contracts,
  date,
}: {
  contracts: ContractService
  date: Temporal.PlainDate
}) {
  // The current contract: undefined while loading, null when there is none.
  const [contract, setContract] = useState<Contract | null>()
  const [loaded, setLoaded] = useState<LoadedExpected>()

  useEffect(() => {
    let current = true
    void contracts.current().then((found) => {
      if (current) setContract(found ?? null)
    })
    return () => {
      current = false
    }
  }, [contracts])

  const period = contract ? periodOf(date, contract.billingCycle) : undefined
  // Loaded per period start, so moving to another day of the period keeps what is shown.
  const periodStart = period?.start.toString()

  useEffect(() => {
    if (!contract || periodStart === undefined) return
    let current = true
    void contracts.expectedFor(contract, periodStart).then((expected) => {
      if (current) setLoaded({ periodStart, expected })
    })
    return () => {
      current = false
      // Returning to this period loads it again, as its value may have been saved since.
      setLoaded(undefined)
    }
  }, [contract, periodStart, contracts])

  const shown = loaded?.periodStart === periodStart ? loaded : undefined

  return (
    <section className="summary" aria-label="Period summary">
      {contract === null && <p className="hint">{NO_CONTRACT_MESSAGE}</p>}
      {contract && period && shown && (
        <SummaryContent
          contracts={contracts}
          contract={contract}
          period={period}
          expected={shown.expected}
        />
      )}
    </section>
  )
}

/** The note before the contract start, else the period with its Expected metric. */
function SummaryContent({
  contracts,
  contract,
  period,
  expected,
}: {
  contracts: ContractService
  contract: Contract
  period: Period
  expected: number | undefined
}) {
  if (!coversPeriod(contract, period)) {
    return <p className="hint">{BEFORE_CONTRACT_MESSAGE}</p>
  }
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
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
      />
      {error ? (
        <span className="n err" id={`${id}-error`} role="alert">
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
