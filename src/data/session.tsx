import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import type { EmployeeSnapshot } from '../types/workforce'
import { createSession, deleteSession } from '../api/client'
import { SessionContext, type StorageState } from './sessionContext'
import { snapshotStore as defaultStore, type SnapshotStore, type StoredPeriod } from './snapshotStore'

const LAST_PERIOD_KEY = 'dashboard-sdm:last-period'

function readLastPeriod(): string | null {
  try {
    return localStorage.getItem(LAST_PERIOD_KEY)
  } catch {
    return null
  }
}

function writeLastPeriod(period: string | null) {
  try {
    if (period) localStorage.setItem(LAST_PERIOD_KEY, period)
    else localStorage.removeItem(LAST_PERIOD_KEY)
  } catch {
    /* Only a convenience: the dashboard still works without it. */
  }
}

let persistenceAsked = false
/**
 * Saved periods live in IndexedDB, which the browser may clear when the disk runs low. Ask once for
 * persistent storage so months of uploads are not evicted silently; refusal is harmless.
 */
function requestPersistence() {
  if (persistenceAsked) return
  persistenceAsked = true
  try {
    void navigator.storage?.persist?.().catch(() => undefined)
  } catch {
    /* Not supported: storage stays best-effort. */
  }
}

export function WorkforceSessionProvider({ children, store = defaultStore }: { children: ReactNode; store?: SnapshotStore }) {
  const [snapshot, setSnapshot] = useState<EmployeeSnapshot | null>(null)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [periods, setPeriods] = useState<StoredPeriod[]>([])
  const [history, setHistory] = useState<EmployeeSnapshot[]>([])
  const [storage, setStorage] = useState<StorageState>('loading')
  const [restoring, setRestoring] = useState(() => Boolean(readLastPeriod()))
  const sessionRef = useRef<string | null>(null)

  const activate = useCallback((nextSnapshot: EmployeeSnapshot, nextSessionId: string) => {
    if (sessionRef.current && sessionRef.current !== nextSessionId) void deleteSession(sessionRef.current)
    sessionRef.current = nextSessionId
    setSnapshot(nextSnapshot)
    setSessionId(nextSessionId)
  }, [])

  const clear = useCallback(() => {
    if (sessionRef.current) void deleteSession(sessionRef.current)
    sessionRef.current = null
    setSnapshot(null)
    setSessionId(null)
    writeLastPeriod(null)
  }, [])

  const refresh = useCallback(async () => {
    const [nextPeriods, nextHistory] = await Promise.all([store.list(), store.getAll()])
    setPeriods(nextPeriods)
    setHistory(nextHistory)
    return nextHistory
  }, [store])

  const open = useCallback(
    async (target: EmployeeSnapshot) => {
      const id = await createSession(target)
      activate(target, id)
      writeLastPeriod(target.period)
    },
    [activate],
  )

  useEffect(() => {
    let cancelled = false
    Promise.all([store.list(), store.getAll()])
      .then(async ([saved, snapshots]) => {
        if (cancelled) return
        setPeriods(saved)
        setHistory(snapshots)
        setStorage('ready')
        const last = readLastPeriod()
        const target = last ? snapshots.find(item => item.period === last) : undefined
        if (target) await open(target).catch(() => writeLastPeriod(null))
      })
      .catch(() => {
        if (!cancelled) setStorage('unavailable')
      })
      .finally(() => {
        if (!cancelled) setRestoring(false)
      })
    return () => {
      cancelled = true
    }
  }, [store, open])

  const savePeriod = useCallback(
    async (next: EmployeeSnapshot) => {
      if (storage === 'unavailable') return false
      try {
        await store.save(next)
        await refresh()
        writeLastPeriod(next.period)
        requestPersistence()
        return true
      } catch {
        return false
      }
    },
    [store, refresh, storage],
  )

  const savePeriods = useCallback(
    async (snapshots: EmployeeSnapshot[]) => {
      const saved: string[] = []
      const failed: string[] = []
      for (const item of snapshots) {
        if (storage === 'unavailable') {
          failed.push(item.period)
          continue
        }
        try {
          await store.save(item)
          saved.push(item.period)
        } catch {
          failed.push(item.period)
        }
      }
      if (saved.length) {
        await refresh().catch(() => undefined)
        // Reopen the newest saved period after a reload, like a single upload does.
        writeLastPeriod([...saved].sort().at(-1)!)
        requestPersistence()
      }
      return { saved, failed }
    },
    [store, refresh, storage],
  )

  const openPeriod = useCallback(
    async (period: string) => {
      const target = history.find(item => item.period === period) ?? (await store.get(period))
      if (!target) throw new Error(`Periode ${period} tidak ditemukan di penyimpanan.`)
      await open(target)
    },
    [history, store, open],
  )

  const removePeriod = useCallback(
    async (period: string) => {
      await store.remove(period)
      await refresh()
      if (readLastPeriod() === period) writeLastPeriod(null)
    },
    [store, refresh],
  )

  return (
    <SessionContext.Provider
      value={{
        snapshot,
        sessionId,
        activate,
        clear,
        periods,
        history,
        storage,
        restoring,
        savePeriod,
        savePeriods,
        openPeriod,
        removePeriod,
      }}
    >
      {children}
    </SessionContext.Provider>
  )
}
