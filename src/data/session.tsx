import { useState, type ReactNode } from 'react'
import type { EmployeeSnapshot } from '../types/workforce'
import { deleteSession } from '../api/client'
import { SessionContext } from './sessionContext'

export function WorkforceSessionProvider({ children }: { children: ReactNode }) {
  const [snapshot, setSnapshot] = useState<EmployeeSnapshot | null>(null)
  const [sessionId, setSessionId] = useState<string | null>(null)
  function activate(nextSnapshot: EmployeeSnapshot, nextSessionId: string) {
    if (sessionId && sessionId !== nextSessionId) void deleteSession(sessionId)
    setSnapshot(nextSnapshot)
    setSessionId(nextSessionId)
  }
  function clear() {
    if (sessionId) void deleteSession(sessionId)
    setSnapshot(null)
    setSessionId(null)
  }
  return <SessionContext.Provider value={{ snapshot, sessionId, activate, clear }}>{children}</SessionContext.Provider>
}
