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
  return `${formatLongDate(date)} ${date.year}`
}

/** A date in English without the year, e.g. "Wednesday 18 November". */
export function formatLongDate(date: Temporal.PlainDate): string {
  return formatDayMonth(date, 'long')
}

/** A date in short English without the year, e.g. "Wed 18 Nov". */
export function formatShortDate(date: Temporal.PlainDate): string {
  return formatDayMonth(date, 'short')
}

/** A month and year in English, e.g. "November 2026". */
export function formatMonthYear(date: Temporal.PlainDate): string {
  return date.toLocaleString('en-GB', { month: 'long', year: 'numeric' })
}

/** The days of a period, e.g. "23–29 Nov 2026", or "28 Dec – 3 Jan 2027" across two months. */
export function formatDateRange(
  start: Temporal.PlainDate,
  end: Temporal.PlainDate,
): string {
  return `${formatShortDateRange(start, end)} ${end.year}`
}

/** The days of a period without the year, e.g. "23–29 Nov", or "28 Dec – 3 Jan" across two months. */
export function formatShortDateRange(
  start: Temporal.PlainDate,
  end: Temporal.PlainDate,
): string {
  const month = (date: Temporal.PlainDate) =>
    date.toLocaleString('en-GB', { month: 'short' })
  const last = `${end.day} ${month(end)}`
  if (start.month === end.month && start.year === end.year) {
    return `${start.day}–${last}`
  }
  return `${start.day} ${month(start)} – ${last}`
}
