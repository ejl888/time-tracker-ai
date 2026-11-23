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

/** Minutes as H:MM, e.g. 60 as "1:00" and 9000 as "150:00". */
export function formatMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return `${hours}:${String(rest).padStart(2, '0')}`
}

/** Minutes with a sign, e.g. 300 as "+5:00", -30 as "-0:30" and 0 as "0:00". */
export function formatSignedMinutes(minutes: number): string {
  const sign = minutes > 0 ? '+' : minutes < 0 ? '-' : ''
  return `${sign}${formatMinutes(Math.abs(minutes))}`
}

const HOURS_PATTERN = /^(\d+)(?::(\d{2}))?$/

/** Parses whole hours (`36`) or `H:MM` (`36:00`, `7:30`) as minutes; `undefined` if not valid or negative. */
export function parseHours(text: string): number | undefined {
  const match = HOURS_PATTERN.exec(text.trim())
  if (!match) return undefined
  const minute = match[2] === undefined ? 0 : Number(match[2])
  if (minute > 59) return undefined
  return Number(match[1]) * 60 + minute
}

/** Like `parseHours`, but with an optional `+` or `-` sign, e.g. `-2:00` as -120. */
export function parseSignedHours(text: string): number | undefined {
  const trimmed = text.trim()
  const sign = trimmed[0] === '-' ? -1 : 1
  const unsigned = /^[+-]/.test(trimmed) ? trimmed.slice(1) : trimmed
  const minutes = parseHours(unsigned)
  return minutes === undefined ? undefined : sign * minutes
}
