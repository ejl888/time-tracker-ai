import { expect, test } from 'vitest'
import { Temporal } from 'temporal-polyfill'
import {
  formatEndTime,
  formatSignedMinutes,
  formatTime,
  parseEndTime,
  parseHours,
  parseSignedHours,
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

test.each([
  ['36', 2160],
  ['36:00', 2160],
  ['7:30', 450],
  ['0', 0],
  [' 36 ', 2160],
])('parseHours(%j) is %i minutes', (text, minutes) => {
  expect(parseHours(text)).toBe(minutes)
})

test.each(['', '36.5', '-4', '-4:00', '7:60', 'abc', '7:5'])(
  'parseHours(%j) is undefined',
  (text) => {
    expect(parseHours(text)).toBeUndefined()
  },
)

test.each([
  ['5', 300],
  ['+5:00', 300],
  ['-2:00', -120],
  ['0:00', 0],
  ['-0:30', -30],
])('parseSignedHours(%j) is %i minutes', (text, minutes) => {
  expect(parseSignedHours(text)).toBe(minutes)
})

test.each(['', '5.5', '+-1', '1:75'])(
  'parseSignedHours(%j) is undefined',
  (text) => {
    expect(parseSignedHours(text)).toBeUndefined()
  },
)

test.each([
  [300, '+5:00'],
  [-120, '-2:00'],
  [0, '0:00'],
  [-30, '-0:30'],
])('formatSignedMinutes(%i) is %s', (minutes, text) => {
  expect(formatSignedMinutes(minutes)).toBe(text)
})
