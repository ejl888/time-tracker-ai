import { timelineOf } from '../domain/timeline.ts'
import { formatMinuteOfDay } from '../domain/timeText.ts'
import type { Day } from './day.ts'

interface TimelineProps {
  day: Day
  /** Whether to show the times the timeline runs from and to below it. */
  scale?: boolean
}

/** The entries of a day as bars by clock time; nothing for a day without entries. */
export function Timeline({ day, scale = false }: TimelineProps) {
  if (day.entries.length === 0) return null
  const { from, to, bars } = timelineOf(day.entries, day.usedLabels)
  return (
    <>
      <div className="timeline" aria-hidden="true">
        {bars.map(({ start, width, billable }, index) => (
          <span
            key={index}
            className={billable ? undefined : 'nb'}
            style={{ left: `${start * 100}%`, width: `${width * 100}%` }}
          />
        ))}
      </div>
      {scale && (
        <div className="tl-scale num" aria-hidden="true">
          <span>{formatMinuteOfDay(from)}</span>
          <span>{formatMinuteOfDay(to)}</span>
        </div>
      )}
    </>
  )
}
