import assert from 'node:assert/strict'
import { Given, Then, When } from '@cucumber/cucumber'
import type { Temporal } from 'temporal-polyfill'
import { ZONE } from '../support/world.ts'
import type { TimetrackerWorld } from '../support/world.ts'

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
