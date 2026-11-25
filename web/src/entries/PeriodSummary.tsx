import { useId, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { Temporal } from 'temporal-polyfill'
import { periodResult } from '../domain/balance.ts'
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
  balanceAfterNote,
  balanceAfterTitle,
  balanceInNote,
  balanceInTitle,
  expectedNote,
  leftNote,
  workedNote,
} from './summaryMessages.ts'
import type { LoadedSummary, SummaryServices } from './useSummary.ts'
import { useSummary } from './useSummary.ts'
import './summary.css'

interface PeriodSummaryProps extends SummaryServices {
  /** The current contract: undefined while loading, null when there is none. */
  contract: Contract | null | undefined
  /** The period shown; undefined while the contract is loading. */
  period: Period | undefined
  today: Temporal.PlainDate
  /** Raised when entries changed, to load the totals again. */
  revision: number
}

/**
 * The summary above the days: the balance, expected and worked hours of the period, and the
 * hours left or the balance after it.
 */
export function PeriodSummary({
  contracts,
  entries,
  labels,
  contract,
  period,
  today,
  revision,
}: PeriodSummaryProps) {
  const { loaded, showExpected } = useSummary(
    { contracts, entries, labels },
    contract,
    period,
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
          today={today}
          loaded={loaded}
          onExpectedSaved={(expected) =>
            showExpected(period.start.toString(), expected)
          }
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

/** The note before the contract start, else the metrics of the period. */
function SummaryContent({
  contracts,
  contract,
  period,
  today,
  loaded,
  onExpectedSaved,
}: {
  contracts: ContractService
  contract: Contract
  period: Period
  today: Temporal.PlainDate
  loaded: LoadedSummary
  onExpectedSaved: (expected: number | undefined) => void
}) {
  if (!coversPeriod(contract, period)) {
    return <p className="hint">{BEFORE_CONTRACT_MESSAGE}</p>
  }
  const { expected, totals } = loaded
  const { balanceIn, worked } = totals
  const result = periodResult(
    contract.billableLimit,
    expected,
    balanceIn,
    worked.billable,
  )
  const isPast = Temporal.PlainDate.compare(period.end, today) < 0
  return (
    <>
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
        onSaved={onExpectedSaved}
      />
      <Metric
        name="Worked"
        value={formatMinutes(worked.billable)}
        note={workedNote(worked.nonBillable)}
      />
      {isPast ? (
        <Metric
          name="Balance after"
          title={balanceAfterTitle(contract.billingCycle)}
          value={formatSignedMinutes(result.balanceAfter)}
          tone={toneOf(result.balanceAfter)}
          note={balanceAfterNote(result.balanceAfter)}
        />
      ) : (
        <LeftMetric
          limit={contract.billableLimit}
          expected={expected}
          left={result.left}
        />
      )}
    </>
  )
}

/** The hours left in the current period; "–" until expected hours are entered. */
function LeftMetric({
  limit,
  expected,
  left,
}: {
  limit: number
  expected: number | undefined
  /** Negative when more is worked than billed. */
  left: number
}) {
  return (
    <Metric
      name="Left"
      value={expected === undefined ? '–' : formatMinutes(Math.max(0, left))}
      note={leftNote(limit, expected, left)}
    />
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
  onSaved,
}: {
  contracts: ContractService
  contract: Contract
  period: Period
  /** The expected minutes stored for the period. */
  stored: number | undefined
  /** Called with the new expected minutes after they were saved. */
  onSaved: (expected: number | undefined) => void
}) {
  const id = useId()
  const [text, setText] = useState(() => textOf(stored))
  const [error, setError] = useState<string>()

  const typed = text.trim() === '' ? undefined : parseHours(text)
  // The note follows what is typed; while that is not valid, it follows the stored value.
  const shownValue = text.trim() === '' || typed !== undefined ? typed : stored

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
    onSaved(typed)
    setText(textOf(typed))
  }

  function handleKey(event: KeyboardEvent<HTMLInputElement>) {
    // Leaving the field saves it, so Enter only leaves it.
    if (event.key === 'Enter') event.currentTarget.blur()
    if (event.key === 'Escape') {
      setText(textOf(stored))
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
