import { useState, type MouseEvent } from 'react'
import { Sparkles } from 'lucide-react'
import { AGE_GROUPS, TENURE_GROUPS, ageGroup, countBy, educationOf, fullYears, genderOf, tenureGroup } from '../analytics/workforce'
import type { EmployeeRecord, Gender, WorkforceFilters } from '../types/workforce'
import { SectionCard } from './SectionCard'
import { ChatPanel } from './ChatPanel'

type Props = {
  records: EmployeeRecord[]
  asOf: string
  filters: WorkforceFilters
  onChange: (filters: WorkforceFilters) => void
  sessionId: string
  query: string
}

type Segment = { key: string; value: number; color: string }
type StackedRow = { name: string; total: number; segments: Segment[] }
type PyramidRow = { group: string; male: number; female: number }
type Slice = { name: string; value: number; color: string; detail?: string }

const number = (value: number) => value.toLocaleString('id-ID')
const percent = (value: number, total: number) => total ? value / total * 100 : 0

const MALE_COLOR = '#21176c'
const FEMALE_COLOR = '#079bd1'
const UNKNOWN_COLOR = '#aab7c7'
const EMPTY_LABEL = '(KOSONG)'
const MAX_FUNCTION_SLICES = 10
const functionColors = ['#326fbd', '#e0a016', '#d7749e', '#4b3b9a', '#e65a58', '#148c31', '#f47b40', '#0f9bb5', '#8e5bc4', '#a3772b']
const OTHER_FUNCTION_COLOR = '#7988a3'
const EMPTY_FUNCTION_COLOR = '#d5dce6'
const EDUCATION_ORDER = ['SLTP', 'SLTA', 'D3', 'D4', 'S1', 'S2', 'S3', 'Kode tidak dikenal', 'Tidak diketahui']
const educationColors: Record<string, string> = {
  SLTP: '#b7c4d4', SLTA: '#dc7a9b', D3: '#d38b20', D4: '#f0c05a', S1: '#0a638c', S2: '#19a37b', S3: '#4b3b9a', 'Kode tidak dikenal': '#7988a3', 'Tidak diketahui': '#d5dce6',
}

const educationKeyLabel: Record<string, string> = { 'Tidak diketahui': 'N/A', 'Kode tidak dikenal': 'Kode lain' }

function genderSegments(matches: EmployeeRecord[]): Segment[] {
  const male = matches.filter(record => genderOf(record) === 'L').length
  const female = matches.filter(record => genderOf(record) === 'P').length
  return [
    { key: 'Laki-laki', value: male, color: MALE_COLOR },
    { key: 'Perempuan', value: female, color: FEMALE_COLOR },
    { key: 'Tidak diketahui', value: matches.length - male - female, color: UNKNOWN_COLOR },
  ]
}

function StackedBars({ rows, total, selected, onSelect }: { rows: StackedRow[]; total: number; selected: string[]; onSelect: (name: string) => void }) {
  const max = Math.max(...rows.map(row => row.total), 1)
  return <div className="tenure-chart stacked-bars">{rows.map(row => {
    const breakdown = row.segments.filter(segment => segment.value > 0).map(segment => `${segment.key} ${number(segment.value)}`).join(', ')
    return <button key={row.name} type="button" className={`tenure-row ${selected.includes(row.name) ? 'chart-active' : ''}`} onClick={() => onSelect(row.name)} aria-label={`Filter ${row.name}: ${number(row.total)} karyawan, ${percent(row.total, total).toFixed(1)} persen (${breakdown})`}>
      <span className="tenure-top"><span title={row.name}>{row.name}</span><strong>{number(row.total)} <small>({percent(row.total, total).toFixed(1)}%)</small></strong></span>
      <span className="tenure-track"><span className="stacked-fill" style={{ width: `${row.total / max * 100}%` }}>{row.segments.filter(segment => segment.value > 0).map(segment => <i key={segment.key} title={`${segment.key}: ${number(segment.value)}`} style={{ width: `${segment.value / row.total * 100}%`, backgroundColor: segment.color }}/>)}</span></span>
    </button>
  })}</div>
}

function Pyramid({ rows, label, selected, onSelect }: { rows: PyramidRow[]; label: (group: string) => string; selected: string[]; onSelect: (group: string, gender?: Gender) => void }) {
  const max = Math.max(...rows.flatMap(row => [row.male, row.female]), 1)
  return <>{rows.map(row => <div className="age-chart-row" key={row.group}>
    <button type="button" className="age-number" onClick={() => onSelect(row.group, 'L')} aria-label={`Filter laki-laki ${label(row.group)}: ${row.male}`}>{number(row.male)}</button>
    <button type="button" className="age-side age-male" onClick={() => onSelect(row.group, 'L')} aria-label={`Filter laki-laki ${label(row.group)}`}><span style={{ width: `${row.male / max * 100}%` }}/></button>
    <button type="button" className={`age-group-label ${selected.includes(row.group) ? 'chart-active' : ''}`} title={row.group} onClick={() => onSelect(row.group)}>{row.group}</button>
    <button type="button" className="age-side age-female" onClick={() => onSelect(row.group, 'P')} aria-label={`Filter perempuan ${label(row.group)}`}><span style={{ width: `${row.female / max * 100}%` }}/></button>
    <button type="button" className="age-number" onClick={() => onSelect(row.group, 'P')} aria-label={`Filter perempuan ${label(row.group)}: ${row.female}`}>{number(row.female)}</button>
  </div>)}</>
}

export function SnapshotCharts({ records, asOf, filters, onChange, sessionId, query }: Props) {
  const [showAllDivisions, setShowAllDivisions] = useState(false)
  const [hoveredSliceIndex, setHoveredSliceIndex] = useState<number | null>(null)
  const total = records.length
  const male = records.filter(record => genderOf(record) === 'L').length
  const female = records.filter(record => genderOf(record) === 'P').length
  const unknown = total - male - female
  const maleShare = percent(male, total)
  const femaleShare = percent(female, total)
  const donutBackground = total
    ? `conic-gradient(${MALE_COLOR} 0% ${maleShare}%, ${FEMALE_COLOR} ${maleShare}% ${maleShare + femaleShare}%, ${UNKNOWN_COLOR} ${maleShare + femaleShare}% 100%)`
    : '#e8edf3'

  // Pie "Komposisi fungsi bisnis" reads the ACTIVITY column (title per stakeholder feedback). Top categories get their own colour, the long tail is grouped as "Lainnya", empty cells stay separate.
  const functionCounts = countBy(records, record => record.activity?.trim() || EMPTY_LABEL)
  const namedFunctions = functionCounts.filter(item => item.name !== EMPTY_LABEL)
  const emptyFunctions = functionCounts.find(item => item.name === EMPTY_LABEL)
  const otherFunctions = namedFunctions.slice(MAX_FUNCTION_SLICES)
  const functionSlices: Slice[] = [
    ...namedFunctions.slice(0, MAX_FUNCTION_SLICES).map((item, index) => ({ ...item, color: functionColors[index % functionColors.length] })),
    ...(otherFunctions.length ? [{ name: `Lainnya (${otherFunctions.length} kategori)`, value: otherFunctions.reduce((sum, item) => sum + item.value, 0), color: OTHER_FUNCTION_COLOR, detail: otherFunctions.map(item => `${item.name} (${item.value})`).join(', ') }] : []),
    ...(emptyFunctions ? [{ ...emptyFunctions, color: EMPTY_FUNCTION_COLOR }] : []),
  ]
  const hoveredSlice = hoveredSliceIndex === null ? null : functionSlices[hoveredSliceIndex]
  let sliceOffset = 0
  const functionGradient = total
    ? `conic-gradient(${functionSlices.map(item => {
      const start = sliceOffset
      sliceOffset += percent(item.value, total)
      return `${item.color} ${start}% ${sliceOffset}%`
    }).join(', ')})`
    : '#e8edf3'

  const pyramidRows = (groups: readonly string[], groupOf: (record: EmployeeRecord) => string): PyramidRow[] => groups.map(group => {
    const matches = records.filter(record => groupOf(record) === group)
    return { group, total: matches.length, male: matches.filter(record => genderOf(record) === 'L').length, female: matches.filter(record => genderOf(record) === 'P').length }
  }).filter(row => row.group !== 'Tidak diketahui' || row.total > 0)
  const ageRows = pyramidRows(AGE_GROUPS, record => ageGroup(fullYears(record.birthDate, asOf)))
  const tenureRows = pyramidRows(TENURE_GROUPS, record => tenureGroup(fullYears(record.joinDate, asOf)))

  const educationRows: StackedRow[] = countBy(records, educationOf).map(item => ({ name: item.name, total: item.value, segments: genderSegments(records.filter(record => educationOf(record) === item.name)) }))
  const educationLevels = EDUCATION_ORDER.filter(level => records.some(record => educationOf(record) === level))
  const divisionRows: StackedRow[] = countBy(records, record => record.division).map(item => {
    const matches = records.filter(record => (record.division || 'Tidak diketahui') === item.name)
    return { name: item.name, total: item.value, segments: educationLevels.map(level => ({ key: level, value: matches.filter(record => educationOf(record) === level).length, color: educationColors[level] })) }
  })
  const shownDivisions = showAllDivisions ? divisionRows : divisionRows.slice(0, 10)

  function toggleGender(gender: Gender) {
    onChange({ ...filters, gender: filters.gender.length === 1 && filters.gender[0] === gender ? [] : [gender] })
  }
  function togglePyramid(key: 'ageGroup' | 'tenureGroup', group: string, gender?: Gender) {
    const same = filters[key].length === 1 && filters[key][0] === group && (gender ? filters.gender.length === 1 && filters.gender[0] === gender : filters.gender.length === 0)
    onChange({ ...filters, [key]: same ? [] : [group], gender: same ? [] : gender ? [gender] : [] })
  }
  function toggleCategory(key: 'education' | 'division', name: string) {
    onChange({ ...filters, [key]: filters[key].length === 1 && filters[key][0] === name ? [] : [name] })
  }
  function showSliceAtPointer(event: MouseEvent<HTMLDivElement>) {
    if (!total) return
    const bounds = event.currentTarget.getBoundingClientRect()
    const x = event.clientX - bounds.left - bounds.width / 2
    const y = event.clientY - bounds.top - bounds.height / 2
    if (Math.hypot(x, y) > bounds.width / 2) { setHoveredSliceIndex(null); return }
    const clockwiseShare = ((Math.atan2(x, -y) * 180 / Math.PI + 360) % 360) / 360 * total
    let cumulative = 0
    const index = functionSlices.findIndex(item => (cumulative += item.value) > clockwiseShare)
    setHoveredSliceIndex(index < 0 ? functionSlices.length - 1 : index)
  }

  const genderKey = <p className="chart-footnote chart-key"><span><i className="legend-dot male-dot"/>Laki-laki</span><span><i className="legend-dot female-dot"/>Perempuan</span>{unknown > 0 && <span><i className="legend-dot unknown-dot"/>Tidak diketahui</span>}</p>

  return <div className="snapshot-charts">
    <div className="snapshot-top">
      <SectionCard title="Komposisi gender" subtitle={`${number(total)} karyawan pada hasil filter`} className="snapshot-card gender-card">
        <button type="button" className="donut-chart" style={{ background: donutBackground }} onClick={() => onChange({ ...filters, gender: [] })} aria-label="Tampilkan semua jenis kelamin"><span><small>Total karyawan</small><strong>{number(total)}</strong></span></button>
        <div className="gender-legend">
          <button type="button" className={filters.gender.includes('L') ? 'chart-active' : ''} onClick={() => toggleGender('L')}><span><i className="legend-dot male-dot"/>Laki-laki</span><strong>{number(male)}</strong><small>{maleShare.toFixed(1)}%</small></button>
          <button type="button" className={filters.gender.includes('P') ? 'chart-active' : ''} onClick={() => toggleGender('P')}><span><i className="legend-dot female-dot"/>Perempuan</span><strong>{number(female)}</strong><small>{femaleShare.toFixed(1)}%</small></button>
        </div>
        {unknown > 0 && <p className="chart-footnote">{number(unknown)} karyawan dengan jenis kelamin tidak diketahui.</p>}
      </SectionCard>
      <SectionCard title="Piramida kelompok usia" subtitle="Laki-laki di kiri · perempuan di kanan" className="snapshot-card age-card">
        <div className="age-pyramid">
          <div className="age-chart-legend"><span><i className="legend-dot male-dot"/>Laki-laki ({number(male)})</span><span><i className="legend-dot female-dot"/>Perempuan ({number(female)})</span></div>
          <Pyramid rows={ageRows} label={group => `usia ${group}`} selected={filters.ageGroup} onSelect={(group, gender) => togglePyramid('ageGroup', group, gender)}/>
        </div>
        <p className="chart-footnote">Usia dihitung dari tanggal lahir per {asOf}. Klik batang untuk menyaring.</p>
      </SectionCard>
      <SectionCard title="Masa kerja" subtitle="Laki-laki di kiri · perempuan di kanan" className="snapshot-card tenure-card">
        <div className="age-pyramid tenure-pyramid">
          <div className="age-chart-legend"><span><i className="legend-dot male-dot"/>Laki-laki ({number(male)})</span><span><i className="legend-dot female-dot"/>Perempuan ({number(female)})</span></div>
          <Pyramid rows={tenureRows} label={group => `masa kerja ${group} tahun`} selected={filters.tenureGroup} onSelect={(group, gender) => togglePyramid('tenureGroup', group, gender)}/>
        </div>
        <p className="chart-footnote">Masa kerja (tahun) dihitung dari tanggal masuk per {asOf}.</p>
      </SectionCard>
    </div>
    <div className="snapshot-bottom">
      <SectionCard title="Komposisi fungsi bisnis" subtitle={`${namedFunctions.length} kategori pada hasil filter`} className="snapshot-card function-card">
        <div className="function-visual"><div className="function-pie" role="img" aria-label={`Distribusi fungsi bisnis dari ${number(total)} karyawan. Arahkan kursor ke irisan untuk melihat persentase.`} style={{ background: functionGradient }} onMouseMove={showSliceAtPointer} onMouseLeave={() => setHoveredSliceIndex(null)}/>{hoveredSlice && <div className="function-tooltip" role="status"><strong>{hoveredSlice.name}</strong><span>{number(hoveredSlice.value)} personel · {percent(hoveredSlice.value, total).toFixed(1)}%</span></div>}</div>
        <div className="function-legend" aria-label="Legenda warna fungsi bisnis">{functionSlices.map(item => <div className="function-legend-item" key={item.name} title={item.detail ?? `${item.name}: ${number(item.value)} personel`}><span className="function-swatch" style={{ backgroundColor: item.color }}/><span className="function-name">{item.name}</span><small>{percent(item.value, total).toFixed(1)}%</small></div>)}</div>
        {!total && <p className="chart-footnote">Tidak ada data fungsi bisnis pada hasil filter.</p>}
      </SectionCard>
      <SectionCard title="Distribusi pendidikan" subtitle="Jenjang formal per jenis kelamin" className="snapshot-card">
        <StackedBars rows={educationRows} total={total} selected={filters.education} onSelect={name => toggleCategory('education', name)}/>
        {genderKey}
      </SectionCard>
      <SectionCard title="Konsentrasi per divisi" subtitle={`${divisionRows.length} unit · komposisi pendidikan`} className="snapshot-card">
        <StackedBars rows={shownDivisions} total={total} selected={filters.division} onSelect={name => toggleCategory('division', name)}/>
        {divisionRows.length > 10 && <button type="button" className="chart-more" onClick={() => setShowAllDivisions(!showAllDivisions)}>{showAllDivisions ? 'Tampilkan 10 teratas' : `Lihat semua ${divisionRows.length} unit`}</button>}
        <p className="chart-footnote chart-key education-key">{educationLevels.map(level => <span key={level} title={level}><i className="legend-dot" style={{ backgroundColor: educationColors[level] }}/>{educationKeyLabel[level] ?? level}</span>)}</p>
      </SectionCard>
      <section className="section-card snapshot-card workforce-ai-card" aria-label="AI Workforce Intelligence">
        <div className="workforce-ai-header"><span className="workforce-ai-mark"><Sparkles size={18}/></span><div><h2>Chatbot SDM</h2><p>Tanya tentang data periode aktif</p></div></div>
        <ChatPanel sessionId={sessionId} filters={filters} query={query} count={total} onApplyFilters={onChange}/>
      </section>
    </div>
  </div>
}
