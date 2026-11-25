import assert from 'node:assert/strict'
import { Given, Then, When } from '@cucumber/cucumber'
import type { DataTable } from '@cucumber/cucumber'
import type { TimetrackerWorld } from '../support/world.ts'

Given(
  'a billable label {name}',
  async function (this: TimetrackerWorld, name: string) {
    const result = await this.labelService.create(name, { billable: true })
    assert.ok(result.ok, `could not create label ${name}`)
  },
)

Given(
  'these labels:',
  async function (this: TimetrackerWorld, table: DataTable) {
    for (const { label, billable } of table.hashes()) {
      assert.match(billable, /^(yes|no)$/, `billable of ${label}`)
      const result = await this.labelService.create(label, {
        billable: billable === 'yes',
      })
      assert.ok(result.ok, `could not create label ${label}`)
    }
  },
)

When(
  'I create a label {name}',
  async function (this: TimetrackerWorld, name: string) {
    this.lastResult = await this.labelService.create(name)
  },
)

When(
  'I create a non-billable label {name}',
  async function (this: TimetrackerWorld, name: string) {
    this.lastResult = await this.labelService.create(name, { billable: false })
  },
)

Then(
  '{name} is billable',
  async function (this: TimetrackerWorld, name: string) {
    const label = await this.findLabel(name)
    assert.ok(label, `no label named ${name}`)
    assert.equal(label.billable, true)
  },
)

Then(
  '{name} is non-billable',
  async function (this: TimetrackerWorld, name: string) {
    const label = await this.findLabel(name)
    assert.ok(label, `no label named ${name}`)
    assert.equal(label.billable, false)
  },
)

Then('the label is rejected', function (this: TimetrackerWorld) {
  assert.ok(this.lastResult, 'no label was created')
  assert.equal(this.lastResult.ok, false, 'the label was accepted')
})

Then(
  'there is {int} label(s) named {name}',
  async function (this: TimetrackerWorld, count: number, name: string) {
    const labels = await this.labelService.list()
    const names = labels.map((label) => label.name)
    assert.equal(
      names.filter((n) => n === name).length,
      count,
      `labels: ${JSON.stringify(names)}`,
    )
  },
)

/** The id of the non-deleted label with this name; fails the step if there is none. */
async function labelId(world: TimetrackerWorld, name: string): Promise<string> {
  const label = await world.findLabel(name)
  assert.ok(label, `no label named ${name}`)
  return label.id
}

When(
  'I mark {name} as non-billable',
  async function (this: TimetrackerWorld, name: string) {
    const id = await labelId(this, name)
    this.lastResult = await this.labelService.setBillable(id, false)
  },
)

When(
  'I rename {name} to {name}',
  async function (this: TimetrackerWorld, name: string, newName: string) {
    const id = await labelId(this, name)
    this.lastResult = await this.labelService.rename(id, newName)
  },
)

Then('the change is rejected', function (this: TimetrackerWorld) {
  assert.ok(this.lastResult, 'no change was made')
  assert.equal(this.lastResult.ok, false, 'the change was accepted')
})

Then(
  '{name} keeps its name',
  async function (this: TimetrackerWorld, name: string) {
    const label = await this.findLabel(name)
    const labels = await this.labelService.list()
    assert.ok(
      label,
      `no label named ${name}; labels: ${JSON.stringify(labels.map((l) => l.name))}`,
    )
  },
)

Given(
  'I delete the label {name}',
  async function (this: TimetrackerWorld, name: string) {
    const id = await labelId(this, name)
    const result = await this.labelService.remove(id)
    assert.ok(result.ok, `could not delete ${name}: ${JSON.stringify(result)}`)
  },
)
