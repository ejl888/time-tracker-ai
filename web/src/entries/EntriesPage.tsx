import type { Clock } from '../domain/clock.ts'
import type { ContractService } from '../domain/contracts.ts'
import { periodOf } from '../domain/contracts.ts'
import type { EntryService } from '../domain/entries.ts'
import { todayIn } from '../domain/entries.ts'
import type { LabelService } from '../domain/labels.ts'
import { daysShown, overviewCycle } from '../domain/overview.ts'
import { formatDateHeading } from './dateText.ts'
import { dayOf } from './day.ts'
import { DayList } from './DayList.tsx'
import { OpenDay } from './OpenDay.tsx'
import { PeriodSummary } from './PeriodSummary.tsx'
import { useContract, usePeriodEntries, usePrefill } from './useOverview.ts'
import { editorOf, focusesAddRow, useView } from './useView.ts'
import './entries.css'

interface EntriesPageProps {
  entries: EntryService
  labels: LabelService
  contracts: ContractService
  clock: Clock
  timeZone: string
}

/** The days of the billing period with one open, today by default, and buttons to go to other days. */
export function EntriesPage({
  entries,
  labels,
  contracts,
  clock,
  timeZone,
}: EntriesPageProps) {
  const today = todayIn(clock.now(), timeZone)
  const { view, goTo, open, edit, cancelEdit, edited, added } = useView(today)
  const { date, revision } = view
  const contract = useContract(contracts)
  const period =
    contract === undefined
      ? undefined
      : periodOf(date, overviewCycle(contract ?? undefined))
  const loaded = usePeriodEntries(entries, labels, period, revision)
  const prefill = usePrefill(entries, date, revision)

  return (
    <section className="entries-page">
      <h2 className="page-title">Entries</h2>
      <div className="period-bar">
        <div className="period-nav">
          <button
            className="icon-btn"
            type="button"
            aria-label="Previous day"
            onClick={() => goTo(date.subtract({ days: 1 }))}
          >
            ‹
          </button>
          <span className="period-title">{formatDateHeading(date)}</span>
          <button
            className="icon-btn"
            type="button"
            aria-label="Next day"
            disabled={date.equals(today)}
            onClick={() => goTo(date.add({ days: 1 }))}
          >
            ›
          </button>
        </div>
        <span className="spacer" />
        <button className="btn" type="button" onClick={() => goTo(today)}>
          Today
        </button>
      </div>
      <PeriodSummary
        contracts={contracts}
        entries={entries}
        labels={labels}
        contract={contract}
        period={period}
        today={today}
        revision={revision}
      />
      {period && loaded && (
        <DayList
          days={daysShown(period, today).map((shown) => dayOf(shown, loaded))}
          openDate={date}
          today={today}
          onOpen={open}
          renderOpen={(day) => (
            <OpenDay
              key={day.date.toString()}
              day={day}
              isToday={day.date.equals(today)}
              entries={entries}
              timeZone={timeZone}
              {...editorOf(view, loaded.revision)}
              prefill={prefill?.prefill}
              focused={focusesAddRow(view, prefill?.revision)}
              onEdit={edit}
              onCancelEdit={cancelEdit}
              onEdited={edited}
              onAdded={() => added(day.date)}
            />
          )}
        />
      )}
    </section>
  )
}
