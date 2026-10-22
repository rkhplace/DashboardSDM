import type { EmployeeSnapshot } from '../types/workforce'

/** Metadata of one saved period, cheap to list without loading the employee rows. */
export interface StoredPeriod {
  period: string
  asOf: string
  sourceFile: string
  rowCount: number
  savedAt: string
}

/**
 * Where period snapshots live. The dashboard only talks to this interface, so the browser
 * implementation below can be swapped for a Portal HC adapter (API or database) later
 * without touching the analytics or UI. One snapshot per period (YYYY-MM); saving the same
 * period again replaces it.
 */
export interface SnapshotStore {
  list(): Promise<StoredPeriod[]>
  get(period: string): Promise<EmployeeSnapshot | null>
  getAll(): Promise<EmployeeSnapshot[]>
  save(snapshot: EmployeeSnapshot): Promise<StoredPeriod>
  remove(period: string): Promise<void>
}

const byPeriod = <T extends { period: string }>(a: T, b: T) => a.period.localeCompare(b.period)

function periodMeta(snapshot: EmployeeSnapshot, savedAt = new Date().toISOString()): StoredPeriod {
  return { period: snapshot.period, asOf: snapshot.asOf, sourceFile: snapshot.sourceFile, rowCount: snapshot.records.length, savedAt }
}

/** In-memory store: used in tests and as a fallback when the browser blocks IndexedDB. */
export function createMemoryStore(): SnapshotStore {
  const items = new Map<string, { meta: StoredPeriod; snapshot: EmployeeSnapshot }>()
  return {
    async list() {
      return [...items.values()].map(item => item.meta).sort(byPeriod)
    },
    async get(period) {
      return items.get(period)?.snapshot ?? null
    },
    async getAll() {
      return [...items.values()].map(item => item.snapshot).sort(byPeriod)
    },
    async save(snapshot) {
      const meta = periodMeta(snapshot)
      items.set(snapshot.period, { meta, snapshot })
      return meta
    },
    async remove(period) {
      items.delete(period)
    },
  }
}

const DB_VERSION = 1
const SNAPSHOTS = 'snapshots'
const PERIODS = 'periods'

function promised<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function done(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
    transaction.onabort = () => reject(transaction.error ?? new Error('Transaksi penyimpanan dibatalkan.'))
  })
}

/** Browser store: snapshots stay in this browser profile only (IndexedDB), never on a server. */
function createIndexedDbStore(name = 'dashboard-sdm-inti', factory: IDBFactory = indexedDB): SnapshotStore {
  let opening: Promise<IDBDatabase> | null = null
  function open(): Promise<IDBDatabase> {
    opening ??= new Promise<IDBDatabase>((resolve, reject) => {
      const request = factory.open(name, DB_VERSION)
      request.onupgradeneeded = () => {
        const db = request.result
        if (!db.objectStoreNames.contains(SNAPSHOTS)) db.createObjectStore(SNAPSHOTS, { keyPath: 'period' })
        if (!db.objectStoreNames.contains(PERIODS)) db.createObjectStore(PERIODS, { keyPath: 'period' })
      }
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
      request.onblocked = () => reject(new Error('Penyimpanan browser sedang dipakai tab lain. Tutup tab lain lalu coba lagi.'))
    }).catch(error => {
      opening = null
      throw error
    })
    return opening
  }
  return {
    async list() {
      const db = await open()
      const rows = await promised(db.transaction(PERIODS).objectStore(PERIODS).getAll() as IDBRequest<StoredPeriod[]>)
      return rows.sort(byPeriod)
    },
    async get(period) {
      const db = await open()
      return (
        (await promised(db.transaction(SNAPSHOTS).objectStore(SNAPSHOTS).get(period) as IDBRequest<EmployeeSnapshot | undefined>)) ?? null
      )
    },
    async getAll() {
      const db = await open()
      const rows = await promised(db.transaction(SNAPSHOTS).objectStore(SNAPSHOTS).getAll() as IDBRequest<EmployeeSnapshot[]>)
      return rows.sort(byPeriod)
    },
    async save(snapshot) {
      const db = await open()
      const meta = periodMeta(snapshot)
      const transaction = db.transaction([SNAPSHOTS, PERIODS], 'readwrite')
      transaction
        .objectStore(SNAPSHOTS)
        .put({ period: snapshot.period, asOf: snapshot.asOf, sourceFile: snapshot.sourceFile, records: snapshot.records })
      transaction.objectStore(PERIODS).put(meta)
      await done(transaction)
      return meta
    },
    async remove(period) {
      const db = await open()
      const transaction = db.transaction([SNAPSHOTS, PERIODS], 'readwrite')
      transaction.objectStore(SNAPSHOTS).delete(period)
      transaction.objectStore(PERIODS).delete(period)
      await done(transaction)
    },
  }
}

export const snapshotStore: SnapshotStore = typeof indexedDB === 'undefined' ? createMemoryStore() : createIndexedDbStore()
