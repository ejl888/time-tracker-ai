import { useEffect, useState } from 'react'
import { Temporal } from 'temporal-polyfill'
import type { ContractService, Period } from '../domain/contracts.ts'
import type { EntryService, Prefill } from '../domain/entries.ts'
import type { LabelService } from '../domain/labels.ts'
import type { Contract, Entry, Label } from '../domain/records.ts'

/** The current contract: undefined while loading, null when there is none. */
export function useContract(
  contracts: ContractService,
): Contract | null | undefined {
  const [contract, setContract] = useState<Contract | null>()

  useEffect(() => {
    let current = true
    void contracts.current().then((found) => {
      if (current) setContract(found ?? null)
    })
    return () => {
      current = false
    }
  }, [contracts])

  return contract
}

/**
 * The earliest date with entries: undefined while loading, null without entries. A raised revision
 * loads it again, keeping the known one until then.
 */
export function useFirstDate(
  entries: EntryService,
  revision: number,
): Temporal.PlainDate | null | undefined {
  const [firstDate, setFirstDate] = useState<Temporal.PlainDate | null>()

  useEffect(() => {
    let current = true
    void entries.firstDate().then((found) => {
      if (current) setFirstDate(found ?? null)
    })
    return () => {
      current = false
    }
  }, [revision, entries])

  return firstDate
}

/** The entries of a period, with the labels to show them. */
export interface PeriodEntries {
  entries: Entry[]
  /** Labels that are not deleted, to pick from. */
  labels: Label[]
  /** The labels the entries use, deleted ones included. */
  usedLabels: Label[]
}

/** The entries loaded for the period from `start` to `end`. */
interface LoadedEntries extends PeriodEntries {
  start: string
  end: string
  /** The revision they were loaded for. */
  revision: number
}

/** Loads the entries from the start up to and including the end date, and their labels. */
async function loadEntries(
  start: string,
  end: string,
  entries: EntryService,
  labels: LabelService,
): Promise<PeriodEntries> {
  const [found, active] = await Promise.all([
    entries.between(
      Temporal.PlainDate.from(start),
      Temporal.PlainDate.from(end),
    ),
    labels.list(),
  ])
  const usedLabels = await labels.usedBy(found)
  return { entries: found, labels: active, usedLabels }
}

/**
 * The entries of the period, or undefined until they are loaded. A raised revision loads them
 * again, keeping the shown ones until then.
 */
export function usePeriodEntries(
  entries: EntryService,
  labels: LabelService,
  period: Period | undefined,
  revision: number,
): LoadedEntries | undefined {
  const [loaded, setLoaded] = useState<LoadedEntries>()
  // Texts, so moving to another day of the period does not load again.
  const start = period?.start.toString()
  const end = period?.end.toString()

  useEffect(() => {
    if (start === undefined || end === undefined) return
    let current = true
    void loadEntries(start, end, entries, labels).then((found) => {
      if (current) setLoaded({ ...found, start, end, revision })
    })
    return () => {
      current = false
    }
  }, [start, end, revision, entries, labels])

  return loaded?.start === start && loaded?.end === end ? loaded : undefined
}

/** The prefill loaded for a new entry on a date. */
interface LoadedPrefill {
  date: string
  /** The revision it was loaded for. */
  revision: number
  /** Undefined when the date has no prefill. */
  prefill: Prefill | undefined
}

/**
 * The prefill for a new entry on the date, or undefined until it is loaded. A raised revision
 * loads it again, keeping the shown one until then.
 */
export function usePrefill(
  entries: EntryService,
  date: Temporal.PlainDate,
  revision: number,
): LoadedPrefill | undefined {
  const [loaded, setLoaded] = useState<LoadedPrefill>()
  const day = date.toString()

  useEffect(() => {
    let current = true
    void entries.prefill(Temporal.PlainDate.from(day)).then((prefill) => {
      if (current) setLoaded({ date: day, revision, prefill })
    })
    return () => {
      current = false
    }
  }, [day, revision, entries])

  return loaded?.date === day ? loaded : undefined
}
