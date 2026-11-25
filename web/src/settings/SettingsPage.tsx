import type { ReactNode } from 'react'
import type { Clock } from '../domain/clock.ts'
import type { ContractService } from '../domain/contracts.ts'
import type { LabelService } from '../domain/labels.ts'
import { LabelsPage } from '../labels/LabelsPage.tsx'
import { ContractPanel } from './ContractPanel.tsx'
import '../sticky.css'
import './settings.css'

/** The settings screen: the contract above the labels. */
export function SettingsPage({
  contracts,
  labels,
  clock,
  timeZone,
  menu,
}: {
  contracts: ContractService
  labels: LabelService
  clock: Clock
  timeZone: string
  /** Goes to the other screens on a phone. */
  menu?: ReactNode
}) {
  return (
    <>
      {menu && (
        <div className="sticky-top settings-bar">
          {menu}
          <h2 className="period-title">Settings</h2>
        </div>
      )}
      <ContractPanel contracts={contracts} clock={clock} timeZone={timeZone} />
      <LabelsPage labels={labels} />
    </>
  )
}
