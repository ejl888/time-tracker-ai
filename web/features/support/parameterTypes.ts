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

// A wall-clock time such as 09:00.
defineParameterType({
  name: 'time',
  regexp: /\d{2}:\d{2}/,
  transformer: (text: string) => Temporal.PlainTime.from(text),
})
