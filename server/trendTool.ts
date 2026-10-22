import { compareSnapshots, countOutcomes, missingMonths, periodSeries, type MovementSummary } from '../src/analytics/trends.ts'
import type { EmployeeRecord, EmployeeSnapshot, WorkforceFilters } from '../src/types/workforce.ts'
import type { IdentityMap } from './identity.ts'

const MAX_PEOPLE = 50
const MAX_GROUPS = 15
const LISTS = ['joined', 'left', 'transfers', 'band', 'status', 'nip', 'contracts'] as const
const GROUPS = ['division', 'directorate', 'status'] as const
type List = (typeof LISTS)[number]
type Group = (typeof GROUPS)[number]

export interface TrendContext {
  active: EmployeeSnapshot
  /** Saved snapshots older than the active one, oldest first. */
  history: EmployeeSnapshot[]
  filters: WorkforceFilters
  retirementAge: number
  /** Comparison period currently chosen in the dashboard panel. */
  compareWith?: string
  /** Older periods left out because the request would have been too large. */
  droppedPeriods?: number
}

export const trendTool = {
  type: 'function',
  name: 'query_trends',
  description: [
    'Data antarperiode dari periode yang tersimpan, dengan perhitungan yang sama persis dengan panel "Analisis antar-periode" di dashboard dan mengikuti filter dashboard. operation "series": jumlah karyawan, aktif, PKWT, masuk, keluar, PKWT keluar (pkwtExits), dan turnover per periode. operation "compare": perpindahan antara dua periode (karyawan masuk, keluar beserta indikasi alasannya, turnover, mutasi unit, perubahan band dan status, ganti NIP, masuk yang perlu dicek, serta tindak lanjut kontrak PKWT yang jatuh tempo).',
    'Kebijakan HC: semua PKWT yang keluar (contractExits), baik karena kontraknya selesai (contractEnded) maupun berhenti sebelum kontrak habis, tidak dihitung sebagai turnover; turnover = turnoverExits (karyawan non-PKWT yang keluar) ÷ rata-rata karyawan non-PKWT dua periode (turnoverBase). contractFollowUp merangkum kontrak PKWT periode awal yang tanggal selesainya sudah lewat pada periode akhir: diperpanjang, diangkat tetap, selesai, atau belum ada keputusan (masih PKWT dengan tanggal selesai yang sama, perlu penilaian atasan).',
    'Bila periode tidak berurutan (ada bulan yang belum diupload), masuk/keluar/turnover mencakup beberapa bulan (spanMonths); bandingkan turnover memakai monthlyTurnoverPercent.',
    'Ganti NIP = NIP lama hilang dan NIP baru muncul dengan nama dan tanggal lahir sama, misalnya PKWT diangkat menjadi karyawan tetap; ini bukan masuk atau keluar.',
    'Isi groupBy untuk rincian masuk/keluar per kelompok dan list untuk daftar karyawan (dikembalikan sebagai kode KARYAWAN_n).',
  ].join(' '),
  parameters: {
    type: 'object',
    properties: {
      operation: { type: 'string', enum: ['series', 'compare'] },
      from: { type: 'string', description: 'Periode awal YYYY-MM untuk compare. Kosongkan untuk memakai periode pembanding di dashboard.' },
      to: { type: 'string', description: 'Periode akhir YYYY-MM untuk compare. Kosongkan untuk periode aktif.' },
      groupBy: {
        type: 'string',
        enum: [...GROUPS],
        description: 'Rincikan karyawan masuk dan keluar per divisi, direktorat, atau status.',
      },
      list: {
        type: 'string',
        enum: [...LISTS],
        description:
          'Daftar karyawan untuk satu jenis perpindahan: joined (masuk), left (keluar), transfers (mutasi), band, status, nip (ganti NIP), contracts (tindak lanjut kontrak jatuh tempo).',
      },
    },
    required: ['operation'],
  },
} as const

const object = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const round = (value: number | null) => (value === null ? null : Math.round(value * 10000) / 100)

function breakdown(records: EmployeeRecord[], group: Group) {
  const counts = new Map<string, number>()
  for (const record of records) {
    const key = record[group] || 'Tidak diketahui'
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return [...counts]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, MAX_GROUPS)
}

function people(movement: MovementSummary, list: List, identities: IdentityMap) {
  const base = (record: EmployeeRecord) => ({
    ref: identities.refFor(record),
    position: record.position,
    division: record.division,
    status: record.status,
  })
  const stale = new Set(movement.staleJoins)
  const rows =
    list === 'joined'
      ? movement.joined.map(record => ({ ...base(record), joinDate: record.joinDate, needsCheck: stale.has(record.nip) }))
      : list === 'left'
        ? movement.left.map(({ record, reason }) => ({ ...base(record), exitIndication: reason }))
        : list === 'transfers'
          ? movement.transfers.map(({ before, after }) => ({
              ...base(after),
              divisionBefore: before.division,
              directorateBefore: before.directorate,
              directorateAfter: after.directorate,
            }))
          : list === 'band'
            ? movement.bandChanges.map(({ before, after, direction }) => ({
                ...base(after),
                bandBefore: before.band,
                bandAfter: after.band,
                direction,
              }))
            : list === 'status'
              ? movement.statusChanges.map(({ before, after }) => ({
                  ...base(after),
                  statusBefore: before.status,
                  statusAfter: after.status,
                }))
              : list === 'nip'
                ? movement.nipChanges.map(({ before, after }) => ({
                    ...base(after),
                    statusBefore: before.status,
                    statusAfter: after.status,
                    previousNipPrefix: before.nip.split('.')[0],
                    newNipPrefix: after.nip.split('.')[0],
                  }))
                : movement.contractFollowUps.map(({ before, after, outcome }) => ({
                    ...base(after ?? before),
                    outcome,
                    contractEndBefore: before.contractEnd,
                    contractEndAfter: after?.contractEnd ?? null,
                    statusAfter: after?.status ?? null,
                  }))
  return {
    list,
    total: rows.length,
    shown: Math.min(rows.length, MAX_PEOPLE),
    truncated: rows.length > MAX_PEOPLE,
    rows: rows.slice(0, MAX_PEOPLE),
  }
}

export function runTrendQuery(input: unknown, context: TrendContext, identities: IdentityMap) {
  const args = object(input) ? input : {}
  const snapshots = [...context.history, context.active].sort((a, b) => a.period.localeCompare(b.period))
  const available = snapshots.map(snapshot => snapshot.period)
  const note = context.droppedPeriods ? `${context.droppedPeriods} periode tertua tidak ikut terkirim karena batas ukuran data.` : undefined
  if (snapshots.length < 2) return { error: 'Baru satu periode tersimpan, belum ada data antarperiode.', periodsAvailable: available }

  if (args.operation === 'series') {
    const series = periodSeries(snapshots, context.filters, context.retirementAge)
    const turnovers = series.map(point => point.monthlyTurnover).filter((value): value is number => value !== null)
    return {
      operation: 'series',
      activePeriod: context.active.period,
      periodsAvailable: available,
      note,
      missingMonths: missingMonths(available),
      periods: series.map(point => ({
        period: point.period,
        headcount: point.headcount,
        active: point.active,
        pkwt: point.contracts,
        joined: point.joined,
        left: point.left,
        pkwtExits: point.contractExits,
        spanMonths: point.spanMonths,
        turnoverPercent: round(point.turnover),
        monthlyTurnoverPercent: round(point.monthlyTurnover),
      })),
      averageMonthlyTurnoverPercent: turnovers.length ? round(turnovers.reduce((sum, value) => sum + value, 0) / turnovers.length) : null,
    }
  }
  if (args.operation !== 'compare') return { error: 'operation harus "series" atau "compare".' }

  const to = typeof args.to === 'string' ? args.to : context.active.period
  const earlier = available.filter(period => period < to)
  const from =
    typeof args.from === 'string'
      ? args.from
      : context.compareWith && context.compareWith < to && available.includes(context.compareWith)
        ? context.compareWith
        : earlier[earlier.length - 1]
  const before = snapshots.find(snapshot => snapshot.period === from)
  const after = snapshots.find(snapshot => snapshot.period === to)
  if (!before || !after || from >= to) return { error: 'Periode tidak tersedia atau urutannya terbalik.', periodsAvailable: available }

  const movement = compareSnapshots(before, after, context.filters, context.retirementAge)
  const group = GROUPS.includes(args.groupBy as Group) ? (args.groupBy as Group) : null
  const list = LISTS.includes(args.list as List) ? (args.list as List) : null
  const bandUp = movement.bandChanges.filter(item => item.direction === 'naik').length
  return {
    operation: 'compare',
    from,
    to,
    periodsAvailable: available,
    note,
    sameAsDashboardPanel: to === context.active.period && from === (context.compareWith ?? earlier[earlier.length - 1]),
    headcountBefore: movement.headcountBefore,
    headcountAfter: movement.headcountAfter,
    joined: movement.joined.length,
    left: movement.left.length,
    net: movement.joined.length - movement.left.length,
    contractExits: movement.contractExits,
    contractEnded: movement.contractEnded,
    turnoverExits: movement.turnoverExits,
    turnoverBase: movement.turnoverBase,
    contractFollowUp: { due: movement.contractFollowUps.length, outcomes: countOutcomes(movement.contractFollowUps) },
    spanMonths: movement.spanMonths,
    turnoverPercent: round(movement.turnover),
    monthlyTurnoverPercent: round(movement.monthlyTurnover),
    exitIndications: movement.exitReasons,
    transfers: movement.transfers.length,
    bandUp,
    bandDown: movement.bandChanges.length - bandUp,
    statusChanges: movement.statusChanges.length,
    nipChanges: movement.nipChanges.length,
    joinedNeedingCheck: movement.staleJoins.length,
    ...(group
      ? {
          groupBy: group,
          joinedBy: breakdown(movement.joined, group),
          leftBy: breakdown(
            movement.left.map(item => item.record),
            group,
          ),
        }
      : {}),
    ...(list ? { people: people(movement, list, identities) } : {}),
  }
}
