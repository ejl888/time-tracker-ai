import { useLayoutEffect, useRef } from 'react'
import type { Temporal } from 'temporal-polyfill'
import type { BillingCycle, Period } from '../domain/contracts.ts'
import { isWithin, periodOf } from '../domain/contracts.ts'
import { canGoBack, canGoForward, shiftPeriod } from '../domain/overview.ts'
import { periodTitle } from './summaryMessages.ts'

interface PeriodBarProps {
  period: Period
  cycle: BillingCycle
  /** The first period to go back to; undefined while loading. */
  first: Period | undefined
  today: Temporal.PlainDate
  onGoTo: (period: Period) => void
}

/** Names the period shown, with buttons to go to other periods. */
export function PeriodBar({
  period,
  cycle,
  first,
  today,
  onGoTo,
}: PeriodBarProps) {
  const { previousRef, titleRef, nextRef, focusHandlers } = useKeptFocus()
  const { title, sub } = periodTitle(period, cycle)

  return (
    <div className="period-bar" {...focusHandlers}>
      <button
        ref={previousRef}
        className="icon-btn"
        type="button"
        aria-label={`Previous ${cycle}`}
        disabled={!first || !canGoBack(period, first)}
        onClick={() => onGoTo(shiftPeriod(period, cycle, -1))}
      >
        ‹
      </button>
      <div className="ptitle">
        <h2 ref={titleRef} className="period-title" tabIndex={-1}>
          {title}
        </h2>
        <span className="period-sub">{sub}</span>
      </div>
      <button
        ref={nextRef}
        className="icon-btn"
        type="button"
        aria-label={`Next ${cycle}`}
        disabled={!canGoForward(period, today)}
        onClick={() => onGoTo(shiftPeriod(period, cycle, 1))}
      >
        ›
      </button>
      <span className="spacer" />
      {!isWithin(today, period) && (
        <button
          className="icon-btn"
          type="button"
          aria-label="Go to today"
          title="Go to today"
          onClick={() => onGoTo(periodOf(today, cycle))}
        >
          <TodayIcon />
        </button>
      )}
    </div>
  )
}

/**
 * Keeps focus in the bar when the focused button becomes disabled or disappears: it moves to an
 * arrow button that is enabled, or else to the title.
 */
function useKeptFocus() {
  const previousRef = useRef<HTMLButtonElement>(null)
  const titleRef = useRef<HTMLHeadingElement>(null)
  const nextRef = useRef<HTMLButtonElement>(null)
  // The document no longer knows the focused element once it is removed.
  const focused = useRef<Element | null>(null)

  useLayoutEffect(() => {
    const element = focused.current
    if (!element) return
    if (element.isConnected && !element.matches(':disabled')) return
    const arrows = [previousRef.current, nextRef.current]
    const enabled = arrows.find((arrow) => arrow && !arrow.disabled)
    const target = enabled ?? titleRef.current
    target?.focus()
  })

  const focusHandlers = {
    onFocus(event: { target: Element }) {
      focused.current = event.target
    },
    onBlur() {
      focused.current = null
    },
  }
  return { previousRef, titleRef, nextRef, focusHandlers }
}

/** A calendar page with a day marked. */
function TodayIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden="true"
    >
      <rect x="2" y="3" width="12" height="11" rx="2" />
      <path d="M2 6.5h12M5.5 1.5v3M10.5 1.5v3" />
      <circle cx="8" cy="10" r="1.6" fill="currentColor" stroke="none" />
    </svg>
  )
}
