import source from './snapshot-2026-07.json'
import type { EmployeeSnapshot } from '../types/workforce'

export interface WorkforceRepository {
  listPeriods(): Promise<string[]>
  getSnapshot(period: string): Promise<EmployeeSnapshot | null>
}

const snapshot = source as EmployeeSnapshot

export const localRepository: WorkforceRepository = {
  async listPeriods() { return [snapshot.period] },
  async getSnapshot(period) { return period === snapshot.period ? snapshot : null },
}

export function getPrototypeSnapshot(): EmployeeSnapshot { return snapshot }
