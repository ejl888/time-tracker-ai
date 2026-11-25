import { defineParameterType } from '@cucumber/cucumber'
import { Temporal } from 'temporal-polyfill'

// A calendar date such as 2026-11-18.
defineParameterType({
  name: 'date',
  regexp: /\d{4}-\d{2}-\d{2}/,
  transformer: (text: string) => Temporal.PlainDate.from(text),
})

// A label name: a bare word (Support) or a quoted string ("  Travel  "), keeping the spaces inside the quotes.
defineParameterType({
  name: 'name',
  regexp: /"[^"]*"|[^\s"]+/,
  transformer: (text: string) =>
    text.startsWith('"') ? text.slice(1, -1) : text,
  // Otherwise every word in a snippet for an undefined step becomes {name}.
  useForSnippets: false,
})

/** A wall-clock time such as 09:00. 24:00 (an entry that ends at midnight) becomes 00:00, as Temporal has no 24:00. */
export function parseTime(text: string): Temporal.PlainTime {
  return Temporal.PlainTime.from(text === '24:00' ? '00:00' : text)
}

// A wall-clock time such as 09:00 or 24:00, parsed with parseTime.
defineParameterType({
  name: 'time',
  regexp: /\d{2}:\d{2}/,
  transformer: parseTime,
})

// A duration in hours and minutes such as 1:00, 7:45 or 150:00, kept as text to compare with formatted output.
defineParameterType({
  name: 'duration',
  regexp: /\d+:\d{2}/,
  transformer: (text: string) => text,
})

/** The first day of a calendar month such as 2026-10. */
export function parseMonth(text: string): Temporal.PlainDate {
  return Temporal.PlainYearMonth.from(text).toPlainDate({ day: 1 })
}

// A calendar month such as 2026-10, parsed with parseMonth.
defineParameterType({
  name: 'month',
  regexp: /\d{4}-\d{2}/,
  transformer: parseMonth,
  // Otherwise the start of every date could become {month} in a snippet.
  useForSnippets: false,
})

// A duration with an optional sign such as +8:00, -1:00 or 0:00, kept as text like {duration}.
defineParameterType({
  name: 'signed',
  regexp: /[+-]?\d+:\d{2}/,
  transformer: (text: string) => text,
  // Otherwise every duration is ambiguous in a snippet.
  useForSnippets: false,
})
