import { hasContractColumn, projectContracts } from '../src/analytics/contracts.ts'
import type { EmployeeRecord } from '../src/types/workforce.ts'
import type { IdentityMap } from './identity.ts'

const MAX_PEOPLE = 50
const CONTRACT_MONTHS_MAX = 48
const DEFAULT_CONTRACT_MONTHS = 6

const intIn = (value: unknown, min: number, max: number) =>
  typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max

/** The contract panel's range (months) sent by the dashboard; falls back to the panel default. */
export function validateContractMonths(input: unknown): number {
  return intIn(input, 1, CONTRACT_MONTHS_MAX) ? (input as number) : DEFAULT_CONTRACT_MONTHS
}

export const contractTool = {
  type: 'function',
  name: 'project_contracts',
  description: [
    'Kontrak PKWT yang akan berakhir, dengan perhitungan yang sama persis dengan panel "Kontrak PKWT berakhir" di dashboard dan mengikuti filter dashboard: jumlah per bulan, per divisi, kontrak yang sudah lewat tanggal selesai, PKWT tanpa tanggal selesai, dan daftar karyawan (kode KARYAWAN_n).',
    'Isi months hanya jika pengguna meminta rentang lain dari panel (1–48 bulan; 48 bulan = batas total PKWT).',
    'Panel ini adalah early warning bagi atasan untuk memutuskan perpanjang, angkat tetap, atau selesai; kontrak yang lewat tanggal selesai tetapi masih tercatat berarti belum ada keputusan.',
  ].join(' '),
  parameters: {
    type: 'object',
    properties: {
      months: { type: 'integer', description: 'Rentang ke depan dalam bulan (1–48). Kosongkan untuk memakai rentang panel.' },
    },
  },
} as const

export function runContractProjection(
  input: unknown,
  records: EmployeeRecord[],
  allRecords: EmployeeRecord[],
  asOf: string,
  panelMonths: number,
  identities: IdentityMap,
) {
  if (!hasContractColumn(allRecords))
    return { available: false, error: 'File periode aktif tidak memiliki kolom tanggal selesai kontrak PKWT.' }
  const args = typeof input === 'object' && input !== null && !Array.isArray(input) ? (input as Record<string, unknown>) : {}
  const months = intIn(args.months, 1, CONTRACT_MONTHS_MAX) ? (args.months as number) : panelMonths
  const projection = projectContracts(records, asOf, months)
  return {
    available: true,
    months,
    sameAsDashboardPanel: months === panelMonths,
    pkwt: projection.contracts,
    withEndDate: projection.withEndDate,
    missingEndDate: projection.missingEndDate,
    endingWithinRange: projection.endingWithinHorizon,
    alreadyPastEndDate: projection.expired,
    perMonth: projection.months.filter(month => month.count > 0).map(month => ({ month: month.month, count: month.count })),
    divisions: projection.divisions.slice(0, 15),
    people: projection.list.slice(0, MAX_PEOPLE).map(item => ({
      ref: identities.refFor(item.record),
      endsOn: item.endsOn,
      monthsLeft: item.monthsLeft,
      alreadyPast: item.expired,
      status: item.record.status,
      position: item.record.position,
      division: item.record.division,
    })),
    peopleTruncated: projection.list.length > MAX_PEOPLE,
  }
}
