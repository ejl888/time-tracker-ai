import assert from 'node:assert/strict'
import { Given, Then, When } from '@cucumber/cucumber'
import type { DataTable } from '@cucumber/cucumber'
import { Temporal } from 'temporal-polyfill'
import {
  clockChangeNotes,
  durationOf,
  endTimeOf,
  overlaps,
  startTimeOf,
} from '../../src/domain/entries.ts'
import { formatMinutes } from '../../src/domain/workedHours.ts'
import { parseTime } from '../support/parameterTypes.ts'
import { TEST_LABEL, ZONE } from '../support/world.ts'
import type { TimetrackerWorld } from '../support/world.ts'

/**
 * Adds an entry with the label of this name, or without a label when the name is undefined;
 * keeps the result, and the entry when it was saved.
 */
async function addEntry(
  world: TimetrackerWorld,
  date: Temporal.PlainDate,
  start: Temporal.PlainTime,
  end: Temporal.PlainTime,
  name: string | undefined,
  description: string,
) {
  let labelId = ''
  if (name !== undefined) {
    const label = await world.findLabel(name)
    assert.ok(label, `no label named ${name}`)
    labelId = label.id
  }
  const result = await world.entryService.add({
    date,
    start,
    end,
    labelId,
    description,
    timeZone: ZONE,
  })
  world.lastResult = result
  if (result.ok) world.lastEntry = result.value
}

/**
 * Adds and saves one table row with start and end, and optional label and description columns.
 * Without a label column, the entry gets the hidden billable test label.
 */
async function addRow(
  world: TimetrackerWorld,
  date: Temporal.PlainDate,
  row: Record<string, string>,
) {
  let name = row.label
  if (name === undefined) {
    await world.ensureTestLabel()
    name = TEST_LABEL
  }
  await addEntry(
    world,
    date,
    parseTime(row.start),
    parseTime(row.end),
    name,
    row.description ?? '',
  )
  assert.ok(
    world.lastResult?.ok,
    `could not add the entry ${JSON.stringify(row)}: ${JSON.stringify(world.lastResult)}`,
  )
}

/** Adds and saves each row of a table on the date; see addRow for the columns. */
async function addEntries(
  world: TimetrackerWorld,
  date: Temporal.PlainDate,
  table: DataTable,
) {
  for (const row of table.hashes()) await addRow(world, date, row)
}

/** A wall-clock time as HH:MM text. */
function hhmm(time: Temporal.PlainTime): string {
  return time.toString({ smallestUnit: 'minute' })
}

Given(
  'an entry on {date} from {time} to {time} labelled {name}',
  async function (
    this: TimetrackerWorld,
    date: Temporal.PlainDate,
    start: Temporal.PlainTime,
    end: Temporal.PlainTime,
    name: string,
  ) {
    const label = await this.findLabel(name)
    assert.ok(label, `no label named ${name}`)
    const result = await this.entryService.add({
      date,
      start,
      end,
      labelId: label.id,
      description: '',
      timeZone: ZONE,
    })
    assert.ok(result.ok, `could not add the entry: ${JSON.stringify(result)}`)
    this.lastEntry = result.value
  },
)

Given(
  'these entries on {date}:',
  async function (
    this: TimetrackerWorld,
    date: Temporal.PlainDate,
    table: DataTable,
  ) {
    await addEntries(this, date, table)
  },
)

Given(
  'these entries:',
  async function (this: TimetrackerWorld, table: DataTable) {
    for (const row of table.hashes()) {
      assert.ok(row.date, `no date in the row ${JSON.stringify(row)}`)
      await addRow(this, Temporal.PlainDate.from(row.date), row)
    }
  },
)

Given(
  'an entry on {date} from {time} to {time}',
  async function (
    this: TimetrackerWorld,
    date: Temporal.PlainDate,
    start: Temporal.PlainTime,
    end: Temporal.PlainTime,
  ) {
    await this.ensureTestLabel()
    await addEntry(this, date, start, end, TEST_LABEL, '')
    assert.ok(
      this.lastResult?.ok,
      `could not add the entry: ${JSON.stringify(this.lastResult)}`,
    )
  },
)

When(
  'I delete the entry on {date}',
  async function (this: TimetrackerWorld, date: Temporal.PlainDate) {
    const entries = await this.entryService.on(date)
    assert.equal(entries.length, 1, `entries on ${date}: ${entries.length}`)
    const result = await this.entryService.remove(entries[0].id)
    assert.ok(
      result.ok,
      `could not delete the entry: ${JSON.stringify(result)}`,
    )
  },
)

When('I delete that entry', async function (this: TimetrackerWorld) {
  assert.ok(this.lastEntry, 'there is no entry yet')
  const result = await this.entryService.remove(this.lastEntry.id)
  assert.ok(result.ok, `could not delete the entry: ${JSON.stringify(result)}`)
})

Then(
  'the entry on {date} is labelled {name}',
  async function (
    this: TimetrackerWorld,
    date: Temporal.PlainDate,
    name: string,
  ) {
    const entries = await this.entryService.on(date)
    assert.equal(entries.length, 1, `entries on ${date}: ${entries.length}`)
    // Looked up in the repository, so a deleted label would still be found.
    const label = await this.labels.get(entries[0].labelId)
    assert.ok(label, `no label with id ${entries[0].labelId}`)
    assert.equal(label.name, name)
  },
)

Then(
  'the duration of that entry is {duration}',
  function (this: TimetrackerWorld, duration: string) {
    assert.ok(this.lastEntry, 'there is no entry yet')
    assert.equal(formatMinutes(durationOf(this.lastEntry)), duration)
  },
)

Then(
  'that entry starts at {time}',
  function (this: TimetrackerWorld, time: Temporal.PlainTime) {
    assert.ok(this.lastEntry, 'there is no entry yet')
    const start = startTimeOf(this.lastEntry)
    assert.ok(
      start.equals(time),
      `that entry starts at ${start.toString()}, expected ${time.toString()}`,
    )
  },
)

// Given and When share this step: the rejection scenarios use it as When.
Given(
  'I add an entry on {date} from {time} to {time} labelled {name}',
  async function (
    this: TimetrackerWorld,
    date: Temporal.PlainDate,
    start: Temporal.PlainTime,
    end: Temporal.PlainTime,
    name: string,
  ) {
    await addEntry(this, date, start, end, name, '')
  },
)

When(
  'I add an entry on {date} from {time} to {time} labelled {name} without a description',
  async function (
    this: TimetrackerWorld,
    date: Temporal.PlainDate,
    start: Temporal.PlainTime,
    end: Temporal.PlainTime,
    name: string,
  ) {
    await addEntry(this, date, start, end, name, '')
  },
)

Then(
  'the entries on {date} are:',
  async function (
    this: TimetrackerWorld,
    date: Temporal.PlainDate,
    table: DataTable,
  ) {
    const entries = await this.entryService.on(date)
    const actual = entries.map((entry) => ({
      start: hhmm(startTimeOf(entry)),
      end: hhmm(endTimeOf(entry)),
    }))
    assert.deepEqual(actual, table.hashes())
  },
)

Then('the entry is saved', function (this: TimetrackerWorld) {
  assert.ok(this.lastResult, 'no entry was added')
  assert.ok(
    this.lastResult.ok,
    `the entry was rejected: ${JSON.stringify(this.lastResult)}`,
  )
})

When(
  'I add an entry on {date} from {time} to {time} without a label',
  async function (
    this: TimetrackerWorld,
    date: Temporal.PlainDate,
    start: Temporal.PlainTime,
    end: Temporal.PlainTime,
  ) {
    await addEntry(this, date, start, end, undefined, '')
  },
)

Then('the entry is rejected', function (this: TimetrackerWorld) {
  assert.ok(this.lastResult, 'no entry was added')
  assert.equal(
    this.lastResult.ok,
    false,
    `the entry was saved: ${JSON.stringify(this.lastResult)}`,
  )
})

Then(
  '{date} shows an overlap warning',
  async function (this: TimetrackerWorld, date: Temporal.PlainDate) {
    const entries = await this.entryService.on(date)
    assert.equal(overlaps(entries), true, `no entries overlap on ${date}`)
  },
)

Then(
  '{date} shows no overlap warning',
  async function (this: TimetrackerWorld, date: Temporal.PlainDate) {
    const entries = await this.entryService.on(date)
    assert.equal(overlaps(entries), false, `entries overlap on ${date}`)
  },
)

When(
  'I change the end time of that entry to {time}',
  async function (this: TimetrackerWorld, end: Temporal.PlainTime) {
    assert.ok(this.lastEntry, 'there is no entry yet')
    const result = await this.entryService.update(this.lastEntry.id, { end })
    this.lastResult = result
    if (result.ok) this.lastEntry = result.value
  },
)

Then(
  'there are no entries on {date}',
  async function (this: TimetrackerWorld, date: Temporal.PlainDate) {
    const entries = await this.entryService.on(date)
    assert.equal(entries.length, 0, `entries on ${date}: ${entries.length}`)
  },
)

When(
  'I enter an entry on {date} from {time} to {time}',
  function (
    this: TimetrackerWorld,
    date: Temporal.PlainDate,
    start: Temporal.PlainTime,
    end: Temporal.PlainTime,
  ) {
    this.clockChangeNotes = clockChangeNotes({
      date,
      start,
      end,
      timeZone: ZONE,
    })
  },
)

Then(
  'I am warned that {time} does not exist and becomes {time}',
  function (
    this: TimetrackerWorld,
    time: Temporal.PlainTime,
    becomes: Temporal.PlainTime,
  ) {
    assert.ok(this.clockChangeNotes, 'no entry was entered')
    const warned = this.clockChangeNotes.some(
      (note) =>
        note.kind === 'skipped' &&
        note.time.equals(time) &&
        note.becomes.equals(becomes),
    )
    assert.ok(
      warned,
      `no warning that ${hhmm(time)} becomes ${hhmm(becomes)}: ${JSON.stringify(this.clockChangeNotes)}`,
    )
  },
)

Then(
  'I am warned that {time} occurs twice and the first one is used',
  function (this: TimetrackerWorld, time: Temporal.PlainTime) {
    assert.ok(this.clockChangeNotes, 'no entry was entered')
    const warned = this.clockChangeNotes.some(
      (note) => note.kind === 'repeated' && note.time.equals(time),
    )
    assert.ok(
      warned,
      `no warning that ${hhmm(time)} occurs twice: ${JSON.stringify(this.clockChangeNotes)}`,
    )
  },
)
