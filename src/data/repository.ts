import source from './snapshot-2026-07.json'
import type { EmployeeSnapshot } from '../types/workforce'

const snapshot = source as EmployeeSnapshot

/** The bundled July 2026 sample used by the tests. */
export function getPrototypeSnapshot(): EmployeeSnapshot {
  return snapshot
}
