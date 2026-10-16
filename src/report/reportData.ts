import { isContract, monthLabel, type ContractProjection } from '../analytics/contracts'
import { describeFilters } from '../analytics/filters'
import { countOutcomes, type ContractFollowUp, type MovementSummary, type PeriodPoint } from '../analytics/trends'
import type { RetirementProjection, RetirementSettings } from '../analytics/retirement'
import { AGE_GROUPS, TENURE_GROUPS, ageGroup, bandMatrix, countBy, educationOf, fullYears, genderOf, summarize, tenureGroup } from '../analytics/workforce'
import type { EmployeeRecord, EmployeeSnapshot, WorkforceFilters } from '../types/workforce'

export type Cell = string | number | null
export interface ReportTable { key: string; title: string; headers: string[]; rows: Cell[][]; percentColumn?: number; note?: string }
export interface Report {
  title: string
  meta: [string, string][]
  kpis: [string, string][]
  compositions: ReportTable[]
  bandMatrix: ReportTable
  retirement: { settings: [string, string][]; windows: ReportTable; divisions: ReportTable; candidates: ReportTable }
  /** Present when the file has a contract end date column. */
  contracts: { settings: [string, string][]; months: ReportTable; divisions: ReportTable; list: ReportTable; followUp: ReportTable | null; followUpNote: string | null } | null
  /** Present when at least two periods are saved. */
  trend: { settings: [string, string][]; periods: ReportTable; movements: ReportTable } | null
  employees: ReportTable
}

/** Dashboard panels beyond the active file: PKWT contracts and period-to-period trends. */
export interface ReportExtras {
  contracts?: { months: number; projection: ContractProjection; followUp: { from: string; items: ContractFollowUp[]; hasContractColumn: boolean } | null } | null
  trend?: { series: PeriodPoint[]; movement: MovementSummary | null } | null
}

const fmt = (value: number) => value.toLocaleString('id-ID')
const share = (value: number, total: number) => total ? value / total : 0

function distribution(key: string, title: string, data: { name: string; value: number }[], total: number, order?: readonly string[]): ReportTable {
  const rows = order ? order.map(name => data.find(item => item.name === name) ?? { name, value: 0 }).filter(item => item.value > 0 || item.name !== 'Tidak diketahui') : data
  return { key, title, headers: ['Kategori', 'Jumlah', 'Persentase'], rows: [...rows.map(item => [item.name, item.value, share(item.value, total)]), ['Total', total, total ? 1 : 0]], percentColumn: 2 }
}

 const monthsSpan = (months: number) => months < 12 ? `${months} bulan` : months % 12 === 0 ? `${months / 12} tahun` : `${Math.floor(months / 12)} tahun ${months % 12} bulan`
const percentText = (value: number | null) => value === null ? '—' : `${(value * 100).toLocaleString('id-ID', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`

function contractSection(extras: ReportExtras['contracts'], asOf: string): Report['contracts'] {
  if (!extras) return null
  const { projection, months, followUp } = extras
  const counts = followUp ? countOutcomes(followUp.items) : []
  return {
    settings: [
      ['Rentang proyeksi', `${monthsSpan(months)} sejak ${asOf}`], ['Karyawan PKWT', fmt(projection.contracts)],
      [`Berakhir dalam ${monthsSpan(months)}`, fmt(projection.endingWithinHorizon)], ['Sudah lewat tanggal selesai (belum ada keputusan)', fmt(projection.expired)],
      ['PKWT tanpa tanggal selesai', fmt(projection.missingEndDate)],
      ...(followUp?.hasContractColumn ? counts.map(item => [`Tindak lanjut vs ${followUp.from}: ${item.outcome}`, fmt(item.count)] as [string, string]) : []),
    ],
    months: { key: 'kontrak-bulan', title: 'Kontrak berakhir per bulan', headers: ['Bulan', 'Jumlah'], rows: projection.months.map(month => [month.label, month.count]) },
    divisions: { key: 'kontrak-divisi', title: 'Kontrak berakhir per divisi', headers: ['Divisi', 'PKWT', 'Berakhir', 'Persentase'], rows: projection.divisions.map(item => [item.division, item.contracts, item.ending, share(item.ending, item.contracts)]), percentColumn: 3 },
    list: { key: 'kontrak-daftar', title: 'Daftar kontrak PKWT berakhir', headers: ['Nama', 'NIP', 'Status', 'Jabatan', 'Divisi', 'Tanggal selesai', 'Sisa waktu'],
      rows: projection.list.map(item => [item.record.name, item.record.nip, item.record.status, item.record.position, item.record.division, item.endsOn, item.expired ? 'Sudah lewat' : item.monthsLeft <= 0 ? 'Bulan ini' : `${item.monthsLeft} bulan`]) },
    followUp: followUp?.hasContractColumn ? { key: 'kontrak-tindak-lanjut', title: `Tindak lanjut kontrak jatuh tempo (dibanding ${followUp.from})`, headers: ['Nama', 'NIP', 'Divisi', 'Selesai kontrak', 'Tindak lanjut', 'Status sekarang', 'Selesai kontrak baru'],
      rows: followUp.items.map(item => [item.before.name, item.before.nip, item.before.division, item.before.contractEnd ?? null, item.outcome, item.after?.status ?? 'Tidak ada di data', item.after?.contractEnd ?? null]) } : null,
    followUpNote: followUp && !followUp.hasContractColumn ? `File ${followUp.from} belum punya kolom tanggal selesai kontrak, jadi tindak lanjut belum bisa dihitung.` : null,
  }
}

function trendSection(extras: ReportExtras['trend']): Report['trend'] {
  if (!extras || extras.series.length < 2) return null
  const { series, movement } = extras
  return {
    settings: movement ? [
      ['Dibandingkan', `${monthLabel(movement.from)} → ${monthLabel(movement.to)}${movement.spanMonths > 1 ? ` (${movement.spanMonths} bulan)` : ''}`],
      ['Jumlah karyawan', `${fmt(movement.headcountBefore)} → ${fmt(movement.headcountAfter)}`],
      ['Masuk', fmt(movement.joined.length)], ['Keluar', `${fmt(movement.left.length)} (${fmt(movement.contractExits)} PKWT)`],
      ['Turnover (non-PKWT)', `${percentText(movement.turnover)}${movement.spanMonths > 1 ? ` · ≈ ${percentText(movement.monthlyTurnover)} per bulan` : ''}`],
      ['Mutasi unit', fmt(movement.transfers.length)], ['Perubahan band', fmt(movement.bandChanges.length)], ['Perubahan status', fmt(movement.statusChanges.length)], ['Ganti NIP', fmt(movement.nipChanges.length)],
    ] : [],
    periods: { key: 'tren-periode', title: 'Ringkasan per periode', headers: ['Periode', 'Karyawan', 'Aktif', 'PKWT', 'Masuk', 'Keluar', 'Keluar PKWT', 'Turnover', 'Rentang (bulan)'],
      rows: series.map(point => [monthLabel(point.period), point.headcount, point.active, point.contracts, point.joined, point.left, point.contractExits, point.turnover, point.spanMonths]), percentColumn: 7,
      note: 'Turnover = karyawan non-PKWT yang keluar ÷ rata-rata karyawan non-PKWT dua periode; PKWT yang keluar tidak dihitung (arahan HC).' },
    movements: { key: 'tren-perpindahan', title: movement ? `Masuk & keluar ${monthLabel(movement.from)} → ${monthLabel(movement.to)}` : 'Masuk & keluar', headers: ['Jenis', 'Nama', 'NIP', 'Jabatan', 'Divisi', 'Status', 'Keterangan'],
      rows: movement ? [
        ...movement.joined.map(record => ['Masuk', record.name, record.nip, record.position, record.division, record.status, record.joinDate ? `Masuk ${record.joinDate}` : null] as Cell[]),
        ...movement.left.map(({ record, reason }) => ['Keluar', record.name, record.nip, record.position, record.division, record.status, reason] as Cell[]),
      ] : [] },
  }
}

export const monthsText = (months: number, overdue: boolean) => overdue ? 'Lewat usia' : months < 12 ? `${months} bulan` : `${Math.floor(months / 12)} tahun ${months % 12} bulan`

export function buildReport(snapshot: EmployeeSnapshot, filters: WorkforceFilters, records: EmployeeRecord[], projection: RetirementProjection, settings: RetirementSettings, extras: ReportExtras = {}): Report {
  const { asOf } = snapshot
  const summary = summarize(records, asOf)
  const total = records.length
  const gender = (record: EmployeeRecord) => genderOf(record) === 'L' ? 'Laki-laki' : genderOf(record) === 'P' ? 'Perempuan' : 'Tidak diketahui'
  const ageRows = AGE_GROUPS.map(group => {
    const people = records.filter(record => ageGroup(fullYears(record.birthDate, asOf)) === group)
    return [group, people.filter(record => genderOf(record) === 'L').length, people.filter(record => genderOf(record) === 'P').length, people.length, share(people.length, total)] as Cell[]
  }).filter(row => row[0] !== 'Tidak diketahui' || Number(row[3]) > 0)
  const matrix = bandMatrix(records)
  const active = describeFilters(filters)
  const retiring = projection.candidates.length - projection.overdue
  const movement = extras.trend?.movement ?? null
  const contractColumn = Boolean(extras.contracts)

  return {
    title: `Laporan Data Karyawan PT INTI (Persero) — Periode ${snapshot.period}`,
    meta: [
      ['Periode', snapshot.period], ['Tanggal data', asOf], ['Sumber file', snapshot.sourceFile],
      ['Filter aktif', active.length ? active.join('; ') : 'Semua data'],
      ['Dibuat', new Date().toLocaleString('id-ID', { dateStyle: 'long', timeStyle: 'short' })],
    ],
    kpis: [
      ['Total karyawan', fmt(summary.total)],
      ['Karyawan aktif', `${fmt(summary.active)} (${(share(summary.active, total) * 100).toFixed(1)}%)`],
      ['Rata-rata usia', summary.averageAge == null ? '—' : `${summary.averageAge.toFixed(1)} tahun`],
      ['Laki-laki', `${fmt(summary.male)} (${(share(summary.male, total) * 100).toFixed(1)}%)`],
      ['Perempuan', `${fmt(summary.female)} (${(share(summary.female, total) * 100).toFixed(1)}%)`],
      ['Jumlah divisi', fmt(summary.units)],
      [`Pensiun ≤${settings.horizonYears} tahun (usia ${settings.age})`, fmt(retiring)],
      ...(extras.contracts ? [[`PKWT berakhir ≤${monthsSpan(extras.contracts.months)}`, fmt(extras.contracts.projection.endingWithinHorizon)] as [string, string]] : []),
      ...(movement ? [[`Turnover non-PKWT vs ${monthLabel(movement.from)}`, percentText(movement.turnover)] as [string, string]] : []),
    ],
    compositions: [
      distribution('status', 'Status kepegawaian', countBy(records, record => record.status), total),
      distribution('direktorat', 'Direktorat', countBy(records, record => record.directorate), total),
      distribution('divisi', 'Divisi / unit', countBy(records, record => record.division), total),
      distribution('gender', 'Jenis kelamin', countBy(records, gender), total),
      { key: 'usia', title: 'Kelompok usia', headers: ['Kelompok usia', 'Laki-laki', 'Perempuan', 'Total', 'Persentase'], rows: ageRows, percentColumn: 4, note: `Usia dihitung dari tanggal lahir per ${asOf}.` },
      distribution('masa-kerja', 'Masa kerja (tahun)', countBy(records, record => tenureGroup(fullYears(record.joinDate, asOf))), total, TENURE_GROUPS),
      distribution('pendidikan', 'Pendidikan', countBy(records, educationOf), total),
      distribution('activity', 'Activity', countBy(records, record => record.activity?.trim() || '(KOSONG)'), total),
    ],
    bandMatrix: { key: 'band', title: 'Matriks band jabatan per unit', headers: ['Unit', ...matrix.bands.map(band => `Band ${band}`), 'Total'], rows: [...matrix.rows.map(row => [row.division, ...row.counts, row.total]), ['Total', ...matrix.totals, total]] },
    retirement: {
      settings: [
        ['Usia pensiun', `${settings.age} tahun`], ['Rentang proyeksi', `${settings.horizonYears} tahun sejak ${asOf}`],
        ['Status dihitung', settings.statuses.join(', ') || '—'], ['Karyawan dihitung', fmt(projection.counted)],
        ['Akan pensiun', fmt(retiring)], ['Posisi struktural terdampak', fmt(projection.keyRetiring)],
        ['Sudah melewati usia pensiun', fmt(projection.overdue)], ['Tanggal lahir tidak valid', fmt(projection.invalidBirthDate)],
      ],
      windows: { key: 'pensiun-periode', title: 'Pensiun per 12 bulan', headers: ['Periode', 'Jumlah', 'Struktural'], rows: projection.windows.map(window => [window.label, window.count, window.keyCount]) },
      divisions: { key: 'pensiun-divisi', title: 'Risiko suksesi per divisi', headers: ['Divisi', 'Dihitung', 'Pensiun', 'Persentase', 'Struktural', 'Risiko'], rows: projection.divisions.map(item => [item.division, item.counted, item.retiring, item.share, item.keyRetiring, item.risk]), percentColumn: 3,
        note: 'Risiko tinggi: ≥20% karyawan divisi pensiun atau ada posisi struktural pensiun. Sedang: ≥10%.' },
      candidates: { key: 'pensiun-daftar', title: 'Daftar karyawan yang akan pensiun', headers: ['Nama', 'NIP', 'Jabatan', 'Divisi', 'Band', 'Struktural', 'Tanggal pensiun', 'Sisa waktu'],
        rows: projection.candidates.map(item => [item.record.name, item.record.nip, item.record.position, item.record.division, item.record.band, item.keyPosition ? 'Ya' : 'Tidak', item.retireOn, monthsText(item.monthsLeft, item.overdue)]) },
    },
    contracts: contractSection(extras.contracts, asOf),
    trend: trendSection(extras.trend),
    employees: { key: 'karyawan', title: 'Daftar karyawan', headers: ['NIP', 'Nama', 'Band', 'Jabatan', 'Jenis jabatan', 'Direktorat', 'Divisi', 'Bagian', 'Status', ...(contractColumn ? ['Selesai kontrak'] : []), 'Jenis kelamin', 'Tanggal lahir', 'Usia', 'Tanggal masuk', 'Masa kerja', 'Pendidikan', 'Activity'],
      rows: records.map(record => [record.nip, record.name, record.band, record.position, record.positionType, record.directorate, record.division, record.section, record.status, ...(contractColumn ? [record.contractEnd ?? (isContract(record) ? 'Belum diisi' : null)] : []), gender(record), record.birthDate, fullYears(record.birthDate, asOf), record.joinDate, fullYears(record.joinDate, asOf), educationOf(record), record.activity]) },
  }
}
