import { Given } from '@cucumber/cucumber'
import type { Temporal } from 'temporal-polyfill'
import type { TimetrackerWorld } from '../support/world.ts'

Given(
  'today is {date}',
  function (this: TimetrackerWorld, date: Temporal.PlainDate) {
    this.setToday(date)
  },
)
