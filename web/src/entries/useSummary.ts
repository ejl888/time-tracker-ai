import { useEffect, useState } from 'react'
import { Temporal } from 'temporal-polyfill'
import { balanceBefore, workedInPeriod } from '../domain/balance.ts'
import type { WorkedMinutes } from '../domain/balance.ts'
import type { ContractService, Period } from '../domain/contracts.ts'
import { periodOf } from '../domain/contracts.ts'
import type { EntryService } from '../domain/entries.ts'
import type { LabelService } from '../domain/labels.ts'
import type { Contract } from '../domain/records.ts'

export interface SummaryServices {
  contracts: ContractService
  entries: EntryService
  labels: LabelService
}

/** The totals of a period, in minutes. */
export interface Totals {
  /** The balance carried into the period. */
  balanceIn: number
  worked: WorkedMinutes
}

/** The loaded values of a period. */
export interface LoadedSummary {
  expected: number | undefined
  totals: Totals
}

/** The expected minutes loaded for the period that starts on `periodStart`. */
interface LoadedExpected {
  periodStart: string
  expected: number | undefined
}

/** The totals loaded for the period that starts on `periodStart`. */
interface LoadedTotals {
  periodStart: string
  totals: Totals
}

/** Loads the records up to the end of the period and works out its totals. */
async function loadTotals(
  contract: Contract,
  period: Period,
  { contracts, entries, labels }: SummaryServices,
): Promise<Totals> {
  const [expected, worked] = await Promise.all([
    contracts.expectedRecords(contract),
    entries.until(period.end),
  ])
  const used = await labels.usedBy(worked)
  return {
    balanceIn: balanceBefore(contract, period, expected, worked, used),
    worked: workedInPeriod(contract, period, worked, used),
  }
}

/**
 * The contract, the period of the date and its values, once loaded. A raised revision loads the
 * totals again, keeping the shown ones until then.
 */
export function useSummary(
  { contracts, entries, labels }: SummaryServices,
  date: Temporal.PlainDate,
  revision: number,
): {
  /** The current contract: undefined while loading, null when there is none. */
  contract: Contract | null | undefined
  period: Period | undefined
  /** The values of the period, or undefined until all of them are loaded. */
  loaded: LoadedSummary | undefined
} {
  const [contract, setContract] = useState<Contract | null>()
  const [loadedExpected, setLoadedExpected] = useState<LoadedExpected>()
  const [loadedTotals, setLoadedTotals] = useState<LoadedTotals>()

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
      if (current) setLoadedExpected({ periodStart, expected })
    })
    return () => {
      current = false
      // Returning to this period loads it again, as its values may have changed since.
      setLoadedExpected(undefined)
      setLoadedTotals(undefined)
    }
  }, [contract, periodStart, contracts])

  useEffect(() => {
    if (!contract || periodStart === undefined) return
    let current = true
    const start = Temporal.PlainDate.from(periodStart)
    void loadTotals(contract, periodOf(start, contract.billingCycle), {
      contracts,
      entries,
      labels,
    }).then((totals) => {
      if (current) setLoadedTotals({ periodStart, totals })
    })
    return () => {
      current = false
    }
  }, [contract, periodStart, revision, contracts, entries, labels])

  const shown =
    loadedExpected?.periodStart === periodStart &&
    loadedTotals?.periodStart === periodStart
  const loaded =
    shown && loadedExpected && loadedTotals
      ? { expected: loadedExpected.expected, totals: loadedTotals.totals }
      : undefined

  return { contract, period, loaded }
}
