import { Temporal } from 'temporal-polyfill'

export interface Clock {
  now(): Temporal.Instant
}

export const systemClock: Clock = {
  now: () => Temporal.Now.instant(),
}

/** A clock that always returns the same instant. */
export function fixedClock(instant: Temporal.Instant): Clock {
  return { now: () => instant }
}
