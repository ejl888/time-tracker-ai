import type { ReactNode } from 'react'
import type { Clock } from '../domain/clock.ts'
import type { ContractService } from '../domain/contracts.ts'
import { periodOf } from '../domain/contracts.ts'
import type { EntryService } from '../domain/entries.ts'
import { todayIn } from '../domain/entries.ts'
import type { LabelService } from '../domain/labels.ts'
import {
  daysShown,
  firstPeriod,
  openDay,
  overviewCycle,
} from '../domain/overview.ts'
import { dayOf } from './day.ts'
import { DayList } from './DayList.tsx'
import { OpenDay } from './OpenDay.tsx'
import { PeriodBar } from './PeriodBar.tsx'
import { PeriodSummary } from './PeriodSummary.tsx'
import {
  useContract,
  useFirstDate,
  usePeriodEntries,
  usePrefill,
} from './useOverview.ts'
import { editorOf, focusesAddRow, useView } from './useView.ts'
import '../sticky.css'
import './entries.css'

interface EntriesPageProps {
  entries: EntryService
  labels: LabelService
  contracts: ContractService
  clock: Clock
  timeZone: string
  /** Goes to the other screens on a phone. */
  menu?: ReactNode
}

/** The days of the billing period with one open, today by default, and a bar to go to other periods. */
export function EntriesPage({
  entries,
  labels,
  contracts,
  clock,
  timeZone,
  menu,
}: EntriesPageProps) {
  const today = todayIn(clock.now(), timeZone)
  const { view, goTo, open, edit, cancelEdit, edited, added } = useView(today)
  const { date, revision } = view
  const contract = useContract(contracts)
  const firstDate = useFirstDate(entries, revision)
  const cycle = overviewCycle(contract ?? undefined)
  const period = contract === undefined ? undefined : periodOf(date, cycle)
  const first =
    contract === undefined || firstDate === undefined
      ? undefined
      : firstPeriod(contract ?? undefined, firstDate ?? undefined, today)
  const loaded = usePeriodEntries(entries, labels, period, revision)
  const prefill = usePrefill(entries, date, revision)

  return (
    <section className="entries-page">
      <div className="sticky-top">
        <PeriodBar
          menu={menu}
          period={period}
          cycle={cycle}
          first={first}
          today={today}
          onGoTo={(other) => goTo(openDay(other, today))}
        />
        <PeriodSummary
          contracts={contracts}
          entries={entries}
          labels={labels}
          contract={contract}
          period={period}
          today={today}
          revision={revision}
        />
      </div>
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
