import { expect, test } from 'vitest'
import { Temporal } from 'temporal-polyfill'
import {
  formatEndTime,
  formatTime,
  parseEndTime,
  parseTime,
} from './timeText.ts'

const time = (text: string) => Temporal.PlainTime.from(text)

test.each([
  ['09:00', '09:00'],
  ['9:00', '09:00'],
  ['00:00', '00:00'],
  ['23:59', '23:59'],
  [' 9:30 ', '09:30'],
])('parseTime(%j) is %s', (text, expected) => {
  expect(parseTime(text)?.equals(time(expected))).toBe(true)
})

test.each([
  '',
  '24:00',
  '9',
  '0930',
  '9:5',
  '25:00',
  '12:60',
  'ab:cd',
  '-1:00',
])('parseTime(%j) is undefined', (text) => {
  expect(parseTime(text)).toBeUndefined()
})

test.each([
  ['24:00', '00:00'],
  [' 24:00 ', '00:00'],
  ['00:00', '00:00'],
  ['9:00', '09:00'],
  ['23:59', '23:59'],
])('parseEndTime(%j) is %s', (text, expected) => {
  expect(parseEndTime(text)?.equals(time(expected))).toBe(true)
})

test.each(['', '24:01', '25:00', '12:60', '9', 'ab:cd'])(
  'parseEndTime(%j) is undefined',
  (text) => {
    expect(parseEndTime(text)).toBeUndefined()
  },
)

test.each([
  ['09:05', '09:05'],
  ['00:00', '00:00'],
  ['23:59', '23:59'],
  ['10:15:30', '10:15'],
])('formatTime(%s) is %s', (input, expected) => {
  expect(formatTime(time(input))).toBe(expected)
})

test.each([
  ['00:00', '24:00'],
  ['09:05', '09:05'],
  ['23:59', '23:59'],
])('formatEndTime(%s) is %s', (input, expected) => {
  expect(formatEndTime(time(input))).toBe(expected)
})
