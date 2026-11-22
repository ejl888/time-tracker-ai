import { Temporal } from 'temporal-polyfill'

/** 00:00; as an end time it means the end of the day (24:00). */
export const MIDNIGHT = new Temporal.PlainTime()

const TIME_PATTERN = /^(\d{1,2}):(\d{2})$/

/** Parses `H:MM` or `HH:MM` (00:00–23:59); `undefined` if the text is not a valid time. */
export function parseTime(text: string): Temporal.PlainTime | undefined {
  const match = TIME_PATTERN.exec(text.trim())
  if (!match) return undefined
  const hour = Number(match[1])
  const minute = Number(match[2])
  if (hour > 23 || minute > 59) return undefined
  return new Temporal.PlainTime(hour, minute)
}

/** Like `parseTime`, but also accepts 24:00 as the end of the day (stored as 00:00). */
export function parseEndTime(text: string): Temporal.PlainTime | undefined {
  return text.trim() === '24:00' ? MIDNIGHT : parseTime(text)
}

/** Formats a time as `HH:MM`, without seconds. */
export function formatTime(time: Temporal.PlainTime): string {
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${pad(time.hour)}:${pad(time.minute)}`
}

/** Like `formatTime`, but shows 00:00 as 24:00, the end of the day. */
export function formatEndTime(time: Temporal.PlainTime): string {
  return time.equals(MIDNIGHT) ? '24:00' : formatTime(time)
}
