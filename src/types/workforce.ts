export type Gender = 'L' | 'P' | 'UNKNOWN'

export interface EmployeeRecord {
  nip: string
  name: string
  band: number | null
  positionType: string | null
  position: string
  directorate: string
  division: string
  section: string
  religion: string | null
  activity: string | null
  businessFunction: string | null
  birthDate: string | null
  sourceAge: number | null
  sourceAgeGroup: string | null
  sourceTenure: number | null
  sourceTenureGroup: string | null
  status: string
  institution: string | null
  major: string | null
  positionCode: number | null
  genderCode: number | null
  genderLabel: string | null
  educationCode: number | null
  joinDate: string | null
  sourceTotal: number | null
}

export interface EmployeeSnapshot {
  period: string
  asOf: string
  sourceFile: string
  records: EmployeeRecord[]
}

export interface ImportBatch {
  batchId: string
  period: string
  filename: string
  uploadedAt: string
  rowCount: number
  validationStatus: 'pending' | 'valid' | 'warning' | 'error'
}

export interface WorkforceFilters {
  directorate: string[]
  division: string[]
  status: string[]
  gender: Gender[]
  band: string[]
  ageGroup: string[]
  tenureGroup: string[]
  education: string[]
}

export const emptyFilters: WorkforceFilters = {
  directorate: [], division: [], status: [], gender: [], band: [], ageGroup: [], tenureGroup: [], education: [],
}
