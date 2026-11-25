import { endTimeOf, startTimeOf } from './entries.ts'
import type { Entry, Label } from './records.ts'
import { endMinutesOf, minutesOf } from './timeText.ts'
import { billableLabelIds } from './workedHours.ts'

/** An entry on a timeline; its start and width are fractions of the span. */
export interface TimelineBar {
  start: number
  width: number
  billable: boolean
}

/** The entries of a day as bars by clock time; the span is in minutes since the start of the day. */
export interface Timeline {
  from: number
  to: number
  bars: TimelineBar[]
}

/** The least a timeline spans: 07:00 to 19:00. */
const SPAN = { from: 7 * 60, to: 19 * 60 }

/**
 * The timeline of the entries of a day, with the bars in the order of the entries. An entry whose end is not
 * after its start on the clock, on the night the clocks go back, gets a bar without width.
 * Expects the labels the entries use, deleted ones included, as those keep their billable setting.
 */
export function timelineOf(entries: Entry[], labels: Label[]): Timeline {
  const billable = billableLabelIds(labels)
  const times = entries.map((entry) => ({
    start: minutesOf(startTimeOf(entry)),
    end: endMinutesOf(endTimeOf(entry)),
    billable: billable.has(entry.labelId),
  }))
  const from = Math.min(SPAN.from, ...times.map(({ start }) => start))
  const to = Math.max(SPAN.to, ...times.map(({ end }) => end))
  const span = to - from
  const bars = times.map(({ start, end, billable }) => ({
    start: (start - from) / span,
    width: Math.max(0, end - start) / span,
    billable,
  }))
  return { from, to, bars }
}
