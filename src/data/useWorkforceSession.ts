import { useContext } from 'react'
import { SessionContext, type WorkforceSession } from './sessionContext'

export function useWorkforceSession(): WorkforceSession {
  const session = useContext(SessionContext)
  if (!session) throw new Error('WorkforceSessionProvider is missing')
  return session
}
