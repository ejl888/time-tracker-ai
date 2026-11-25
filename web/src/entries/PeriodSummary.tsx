import { useId, useState } from 'react'
import type { KeyboardEvent } from 'react'
import type { Temporal } from 'temporal-polyfill'
import type { ContractService, Period } from '../domain/contracts.ts'
import { coversPeriod } from '../domain/contracts.ts'
import type { Contract } from '../domain/records.ts'
import {
  formatMinutes,
  formatSignedMinutes,
  parseHours,
} from '../domain/timeText.ts'
import {
  INVALID_HOURS_MESSAGE,
  contractErrorMessage,
} from '../settings/contractMessages.ts'
import { Metric } from './Metric.tsx'
import {
  BEFORE_CONTRACT_MESSAGE,
  NO_CONTRACT_MESSAGE,
  balanceInNote,
  balanceInTitle,
  expectedNote,
  periodTitle,
  workedNote,
} from './summaryMessages.ts'
import type { LoadedSummary, SummaryServices } from './useSummary.ts'
import { useSummary } from './useSummary.ts'
import './summary.css'

interface PeriodSummaryProps extends SummaryServices {
  date: Temporal.PlainDate
  /** Raised when entries changed, to load the totals again. */
  revision: number
}

/** The summary bar above the day: the period of the day with its balance, expected and worked hours. */
export function PeriodSummary({
  contracts,
  entries,
  labels,
  date,
  revision,
}: PeriodSummaryProps) {
  const { contract, period, loaded } = useSummary(
    { contracts, entries, labels },
    date,
    revision,
  )

  return (
    <section className="summary" aria-label="Period summary">
      {contract === null && <p className="hint">{NO_CONTRACT_MESSAGE}</p>}
      {contract && period && loaded && (
        <SummaryContent
          contracts={contracts}
          contract={contract}
          period={period}
          loaded={loaded}
        />
      )}
    </section>
  )
}

/** The tone a balance is shown in; none when it is zero. */
function toneOf(balance: number): 'pos' | 'neg' | undefined {
  if (balance === 0) return undefined
  return balance > 0 ? 'pos' : 'neg'
}

/** The note before the contract start, else the period with its metrics. */
function SummaryContent({
  contracts,
  contract,
  period,
  loaded,
}: {
  contracts: ContractService
  contract: Contract
  period: Period
  loaded: LoadedSummary
}) {
  if (!coversPeriod(contract, period)) {
    return <p className="hint">{BEFORE_CONTRACT_MESSAGE}</p>
  }
  const { expected, totals } = loaded
  const { balanceIn, worked } = totals
  const { title, sub } = periodTitle(period, contract.billingCycle)
  return (
    <>
      <div className="ptitle">
        <h2 className="period-name">{title}</h2>
        <span className="period-sub">{sub}</span>
      </div>
      <Metric
        name="Balance in"
        title={balanceInTitle(contract.billingCycle)}
        value={formatSignedMinutes(balanceIn)}
        tone={toneOf(balanceIn)}
        note={balanceInNote(contract.billingCycle)}
      />
      <ExpectedMetric
        key={period.start.toString()}
        contracts={contracts}
        contract={contract}
        period={period}
        stored={expected}
      />
      <Metric
        name="Worked"
        value={formatMinutes(worked.billable)}
        note={workedNote(worked.nonBillable)}
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

  function handleKey(event: KeyboardEvent<HTMLInputElement>) {
    // Leaving the field saves it, so Enter only leaves it.
    if (event.key === 'Enter') event.currentTarget.blur()
    if (event.key === 'Escape') {
      setText(textOf(saved))
      setError(undefined)
    }
  }

  return (
    <div className="metric">
      <label className="k" htmlFor={id} title="Expected billable hours">
        Expected
      </label>
      <input
        className={error ? 'exp-input invalid' : 'exp-input'}
        id={id}
        type="text"
        placeholder="36"
        value={text}
        onChange={(e) => {
          setText(e.target.value)
          setError(undefined)
        }}
        onBlur={() => void save()}
        onKeyDown={handleKey}
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
