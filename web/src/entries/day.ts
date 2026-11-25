import type { Temporal } from 'temporal-polyfill'
import { isActiveOn } from '../domain/entries.ts'
import { formatMinutes, workedMinutesOn } from '../domain/workedHours.ts'
import type { PeriodEntries } from './useOverview.ts'

/** The entries of one date with the labels to show them. */
export interface Day extends PeriodEntries {
  date: Temporal.PlainDate
}

/** The day on the date, from the entries of its period. */
export function dayOf(
  date: Temporal.PlainDate,
  { entries, labels, usedLabels }: PeriodEntries,
): Day {
  const ofDay = entries.filter((entry) => isActiveOn(entry, date))
  return { date, entries: ofDay, labels, usedLabels }
}

/** The worked hours of a day, e.g. "7:45 worked". */
export function workedText(day: Day): string {
  const worked = workedMinutesOn(day.date, day.entries, day.usedLabels)
  return `${formatMinutes(worked)} worked`
}
