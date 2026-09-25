import { createContext } from 'react'
import type { EmployeeSnapshot } from '../types/workforce'

export interface WorkforceSession {
  snapshot: EmployeeSnapshot | null
  sessionId: string | null
  activate: (snapshot: EmployeeSnapshot, sessionId: string) => void
  clear: () => void
}

export const SessionContext = createContext<WorkforceSession | null>(null)
