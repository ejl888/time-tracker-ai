import type { Temporal } from 'temporal-polyfill'

/** How long the weekday and month names are: "Wed" and "Nov", or "Wednesday" and "November". */
type NameWidth = 'short' | 'long'

/** Weekday, day and month in English, e.g. "Wed 18 Nov", built from parts so no comma appears. */
function formatDayMonth(date: Temporal.PlainDate, width: NameWidth): string {
  const weekday = date.toLocaleString('en-GB', { weekday: width })
  const month = date.toLocaleString('en-GB', { month: width })
  return `${weekday} ${date.day} ${month}`
}

/** A date in English, e.g. "Wednesday 18 November 2026". */
export function formatDateHeading(date: Temporal.PlainDate): string {
  return `${formatDayMonth(date, 'long')} ${date.year}`
}

/** A date in short English without the year, e.g. "Wed 18 Nov". */
export function formatShortDate(date: Temporal.PlainDate): string {
  return formatDayMonth(date, 'short')
}
