import { createContext } from 'react'
import type { EmployeeSnapshot } from '../types/workforce'
import type { StoredPeriod } from './snapshotStore'

export type StorageState = 'loading' | 'ready' | 'unavailable'

export interface WorkforceSession {
  snapshot: EmployeeSnapshot | null
  sessionId: string | null
  activate: (snapshot: EmployeeSnapshot, sessionId: string) => void
  clear: () => void
  /** Saved periods, oldest first. */
  periods: StoredPeriod[]
  /** Every saved snapshot, oldest first; the source for period-to-period analysis. */
  history: EmployeeSnapshot[]
  storage: StorageState
  /** True while the last opened period is being reopened after a page reload. */
  restoring: boolean
  /** Saves the snapshot as its period (replacing an earlier save); false when the browser cannot store it. */
  savePeriod: (snapshot: EmployeeSnapshot) => Promise<boolean>
  /** Saves several periods in one go; returns which periods were stored and which failed. */
  savePeriods: (snapshots: EmployeeSnapshot[]) => Promise<{ saved: string[]; failed: string[] }>
  openPeriod: (period: string) => Promise<void>
  removePeriod: (period: string) => Promise<void>
}

export const SessionContext = createContext<WorkforceSession | null>(null)
