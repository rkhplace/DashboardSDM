import { AGE_GROUPS, TENURE_GROUPS, educationOf, genderOf } from '../src/analytics/workforce.ts'
import { emptyFilters, type ChatChart, type EmployeeRecord, type WorkforceFilters } from '../src/types/workforce.ts'

const FIELD_LABELS: Record<string, string> = {
  status: 'status', activity: 'activity', directorate: 'direktorat', division: 'divisi', section: 'bagian', position: 'jabatan',
  positionType: 'jenis jabatan', businessFunction: 'fungsi bisnis', band: 'band', gender: 'jenis kelamin', education: 'pendidikan',
  religion: 'agama', institution: 'institusi', major: 'jurusan', age: 'usia', ageGroup: 'kelompok usia', tenure: 'masa kerja', tenureGroup: 'kelompok masa kerja',
}
const MAX_BARS = 15
const MAX_CHARTS = 2
const object = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

/** Turns a grouped query_workforce result into a bar chart; returns null for single numbers. */
export function chartFromQuery(output: unknown): ChatChart | null {
  if (!object(output) || !Array.isArray(output.groups) || !Array.isArray(output.groupBy)) return null
  const average = output.operation === 'average'
  const data = output.groups.filter(object).map(group => ({
    label: object(group.values) ? Object.values(group.values).map(String).join(' · ') : '',
    value: average ? (typeof group.average === 'number' ? Math.round(group.average * 10) / 10 : NaN) : Number(group.count),
  })).filter(item => item.label && Number.isFinite(item.value))
  if (data.length < 2) return null
  const by = output.groupBy.map(field => FIELD_LABELS[String(field)] ?? String(field)).join(' & ')
  const field = FIELD_LABELS[String(output.field)] ?? String(output.field)
  return {
    title: average ? `Rata-rata ${field} per ${by}` : `Jumlah karyawan per ${by}`,
    unit: average ? (output.field === 'band' ? '' : 'tahun') : 'orang',
    data: data.slice(0, MAX_BARS),
    truncated: data.length > MAX_BARS || output.truncated === true,
  }
}

type FilterKey = keyof WorkforceFilters
const FILTER_KEYS = Object.keys(emptyFilters) as FilterKey[]
const normal = (value: string) => value.toLocaleLowerCase('id').replace(/[‐‑‒–—−]/g, '-').replace(/[^a-z0-9<>≤+-]/g, '')

export const filterTool = {
  type: 'function',
  name: 'set_dashboard_filters',
  description: 'Usulkan filter dashboard saat pengguna meminta menampilkan, menyaring, memfokuskan, atau membuka kelompok tertentu di dashboard (misal "tampilkan PKWT di divisi X"). Filter ini menggantikan filter aktif; pengguna menerapkannya lewat tombol di bawah jawaban. Pakai nilai kategori persis dari PROFIL DATA. Isi hanya kunci yang diminta.',
  parameters: {
    type: 'object',
    properties: {
      directorate: { type: 'array', items: { type: 'string' } },
      division: { type: 'array', items: { type: 'string' } },
      status: { type: 'array', items: { type: 'string' } },
      gender: { type: 'array', items: { type: 'string', enum: ['L', 'P'] }, description: 'L = laki-laki, P = perempuan.' },
      band: { type: 'array', items: { type: 'string' }, description: 'Nomor band sebagai teks, atau "Tidak tersedia".' },
      ageGroup: { type: 'array', items: { type: 'string', enum: [...AGE_GROUPS] } },
      tenureGroup: { type: 'array', items: { type: 'string', enum: [...TENURE_GROUPS] }, description: 'Kelompok masa kerja dalam tahun.' },
      education: { type: 'array', items: { type: 'string' } },
    },
  },
} as const

export function filterOptions(records: EmployeeRecord[]): Record<FilterKey, string[]> {
  const unique = (values: string[]) => [...new Set(values.filter(Boolean))]
  return {
    directorate: unique(records.map(record => record.directorate)),
    division: unique(records.map(record => record.division || 'Tidak diketahui')),
    status: unique(records.map(record => record.status)),
    gender: unique(records.map(record => genderOf(record))),
    band: unique(records.map(record => record.band == null ? 'Tidak tersedia' : String(record.band))),
    ageGroup: [...AGE_GROUPS],
    tenureGroup: [...TENURE_GROUPS],
    education: unique(records.map(record => educationOf(record))),
  }
}

/** Maps model-proposed filter values onto categories that exist in the uploaded file. */
export function resolveFilterSuggestion(input: unknown, records: EmployeeRecord[]) {
  if (!object(input)) return { error: 'Parameter filter tidak valid.' }
  const options = filterOptions(records)
  const filters: WorkforceFilters = { ...emptyFilters }
  const rejected: string[] = []
  let accepted = 0
  for (const key of FILTER_KEYS) {
    const raw = input[key]
    if (raw === undefined) continue
    if (!Array.isArray(raw)) { rejected.push(key); continue }
    const chosen: string[] = []
    for (const value of raw.slice(0, 30)) {
      if (typeof value !== 'string' || value.length > 100) continue
      const wanted = key === 'gender' ? (/^(l|laki)/i.test(value) ? 'L' : /^(p|perempuan|wanita)/i.test(value) ? 'P' : value) : value
      const match = options[key].find(option => normal(option) === normal(wanted))
      if (match && !chosen.includes(match)) chosen.push(match)
      else if (!match) rejected.push(`${key}: ${value}`)
    }
    filters[key] = chosen as never
    accepted += chosen.length
  }
  if (!accepted) return { error: 'Tidak ada nilai filter yang cocok dengan kategori pada data.', rejected }
  return { ok: true, filters, rejected }
}

/** Tool runners for one chat turn; they record charts and filter suggestions for the response. */
export function createTurnTools(runQuery: (args: unknown) => unknown, allRecords: EmployeeRecord[], runList?: (args: unknown) => unknown, runRetirement?: (args: unknown) => unknown) {
  const charts: ChatChart[] = []
  let suggestedFilters: WorkforceFilters | null = null
  return {
    runQuery(args: unknown) {
      const output = runQuery(args)
      const chart = chartFromQuery(output)
      if (chart) charts.push(chart)
      return output
    },
    applyFilters(args: unknown) {
      const result = resolveFilterSuggestion(args, allRecords)
      if ('filters' in result && result.filters) suggestedFilters = result.filters
      return result
    },
    listEmployees: runList,
    projectRetirement: runRetirement,
    extras() { return { charts: charts.slice(-MAX_CHARTS), suggestedFilters } },
  }
}
