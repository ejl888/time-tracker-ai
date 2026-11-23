import type { Clock } from '../domain/clock.ts'
import type { ContractService } from '../domain/contracts.ts'
import type { LabelService } from '../domain/labels.ts'
import { LabelsPage } from '../labels/LabelsPage.tsx'
import { ContractPanel } from './ContractPanel.tsx'

/** The settings screen: the contract above the labels. */
export function SettingsPage({
  contracts,
  labels,
  clock,
  timeZone,
}: {
  contracts: ContractService
  labels: LabelService
  clock: Clock
  timeZone: string
}) {
  return (
    <>
      <ContractPanel contracts={contracts} clock={clock} timeZone={timeZone} />
      <LabelsPage labels={labels} />
    </>
  )
}
