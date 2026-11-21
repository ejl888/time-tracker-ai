import assert from 'node:assert/strict'
import { Given, Then, When } from '@cucumber/cucumber'
import type { TimetrackerWorld } from '../support/world.ts'

Given(
  'a billable label {name}',
  async function (this: TimetrackerWorld, name: string) {
    const result = await this.labelService.create(name, { billable: true })
    assert.ok(result.ok, `could not create label ${name}`)
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
