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

type Count = { name: string; value: number }

const number = (value: number) => value.toLocaleString('id-ID')
const percent = (value: number, total: number) => total ? value / total * 100 : 0
const activityColors = ['#326fbd', '#e0a016', '#d7749e', '#4b3b9a', '#e65a58', '#148c31', '#f47b40', '#7988a3']

function RankedBars({ data, total, selected, onSelect, tone }: { data: Count[]; total: number; selected: string[]; onSelect: (name: string) => void; tone: 'education' | 'division' }) {
  const max = Math.max(...data.map(item => item.value), 1)
  return <div className={`ranked-bars ranked-${tone}`}>{data.map(item => <button key={item.name} type="button" className={`ranked-row ${selected.includes(item.name) ? 'chart-active' : ''}`} onClick={() => onSelect(item.name)} aria-label={`Filter ${item.name}: ${number(item.value)} karyawan, ${percent(item.value, total).toFixed(1)} persen`}><span className="ranked-top"><span title={item.name}>{item.name}</span><strong>{number(item.value)} <small>({percent(item.value, total).toFixed(1)}%)</small></strong></span><span className="ranked-track"><span style={{ width: `${item.value / max * 100}%` }}/></span></button>)}</div>
}

export function SnapshotCharts({ records, asOf, filters, onChange, sessionId, query }: Props) {
  const [showAllDivisions, setShowAllDivisions] = useState(false)
  const [hoveredActivityIndex, setHoveredActivityIndex] = useState<number | null>(null)
  const total = records.length
  const male = records.filter(record => genderOf(record) === 'L').length
  const female = records.filter(record => genderOf(record) === 'P').length
  const unknown = total - male - female
  const maleShare = percent(male, total)
  const femaleShare = percent(female, total)
  const donutBackground = total
    ? `conic-gradient(#21176c 0% ${maleShare}%, #079bd1 ${maleShare}% ${maleShare + femaleShare}%, #aab7c7 ${maleShare + femaleShare}% 100%)`
    : '#e8edf3'
  const activities = countBy(records, record => record.activity?.trim() || '(KOSONG)')
  const hoveredActivity = hoveredActivityIndex === null ? null : activities[hoveredActivityIndex]
  let activityOffset = 0
  const activityGradient = total
    ? `conic-gradient(${activities.map((item, index) => {
      const start = activityOffset
      activityOffset += percent(item.value, total)
      return `${activityColors[index % activityColors.length]} ${start}% ${activityOffset}%`
    }).join(', ')})`
    : '#e8edf3'
  const ageRows = AGE_GROUPS.map(group => {
    const matches = records.filter(record => ageGroup(fullYears(record.birthDate, asOf)) === group)
    return { group, male: matches.filter(record => genderOf(record) === 'L').length, female: matches.filter(record => genderOf(record) === 'P').length, unknown: matches.filter(record => genderOf(record) === 'UNKNOWN').length }
  }).filter(row => row.group !== 'Tidak diketahui' || row.male + row.female + row.unknown > 0)
  const ageMax = Math.max(...ageRows.flatMap(row => [row.male, row.female]), 1)
  const tenureRows = TENURE_GROUPS.map(group => {
    const matches = records.filter(record => tenureGroup(fullYears(record.joinDate, asOf)) === group)
    const male = matches.filter(record => genderOf(record) === 'L').length
    const female = matches.filter(record => genderOf(record) === 'P').length
    return { group, total: matches.length, male, female, unknown: matches.length - male - female }
  }).filter(row => row.total > 0)
  const tenureMax = Math.max(...tenureRows.map(row => row.total), 1)
  const education = countBy(records, educationOf)
  const divisions = countBy(records, record => record.division)
  const shownDivisions = showAllDivisions ? divisions : divisions.slice(0, 10)

  function toggleGender(gender: Gender) {
    onChange({ ...filters, gender: filters.gender.length === 1 && filters.gender[0] === gender ? [] : [gender] })
  }
  function toggleAge(group: string, gender?: Gender) {
    const same = filters.ageGroup.length === 1 && filters.ageGroup[0] === group && (gender ? filters.gender.length === 1 && filters.gender[0] === gender : filters.gender.length === 0)
    onChange({ ...filters, ageGroup: same ? [] : [group], gender: same ? [] : gender ? [gender] : [] })
  }
  function toggleCategory(key: 'tenureGroup' | 'education' | 'division', name: string) {
    onChange({ ...filters, [key]: filters[key].length === 1 && filters[key][0] === name ? [] : [name] })
  }
  function showActivityAtPointer(event: MouseEvent<HTMLDivElement>) {
    if (!total) return
    const bounds = event.currentTarget.getBoundingClientRect()
    const x = event.clientX - bounds.left - bounds.width / 2
    const y = event.clientY - bounds.top - bounds.height / 2
    if (Math.hypot(x, y) > bounds.width / 2) { setHoveredActivityIndex(null); return }
    const clockwiseShare = ((Math.atan2(x, -y) * 180 / Math.PI + 360) % 360) / 360 * total
    let cumulative = 0
    const index = activities.findIndex(item => (cumulative += item.value) > clockwiseShare)
    setHoveredActivityIndex(index < 0 ? activities.length - 1 : index)
  }

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
          {ageRows.map(row => <div className="age-chart-row" key={row.group}>
            <button type="button" className="age-number" onClick={() => toggleAge(row.group, 'L')} aria-label={`Filter laki-laki usia ${row.group}: ${row.male}`}>{number(row.male)}</button>
            <button type="button" className="age-side age-male" onClick={() => toggleAge(row.group, 'L')} aria-label={`Filter laki-laki usia ${row.group}`}><span style={{ width: `${row.male / ageMax * 100}%` }}/></button>
            <button type="button" className={`age-group-label ${filters.ageGroup.includes(row.group) ? 'chart-active' : ''}`} onClick={() => toggleAge(row.group)}>{row.group}</button>
            <button type="button" className="age-side age-female" onClick={() => toggleAge(row.group, 'P')} aria-label={`Filter perempuan usia ${row.group}`}><span style={{ width: `${row.female / ageMax * 100}%` }}/></button>
            <button type="button" className="age-number" onClick={() => toggleAge(row.group, 'P')} aria-label={`Filter perempuan usia ${row.group}: ${row.female}`}>{number(row.female)}</button>
          </div>)}
        </div>
        <p className="chart-footnote">Usia dihitung dari tanggal lahir per {asOf}. Klik batang untuk menyaring.</p>
      </SectionCard>
      <SectionCard title="Komposisi activity" subtitle={`${activities.length} kategori pada hasil filter`} className="snapshot-card activity-card">
        <div className="activity-visual"><div className="activity-pie" role="img" aria-label={`Distribusi activity dari ${number(total)} karyawan. Arahkan kursor ke irisan untuk melihat persentase.`} style={{ background: activityGradient }} onMouseMove={showActivityAtPointer} onMouseLeave={() => setHoveredActivityIndex(null)}/>{hoveredActivity && <div className="activity-tooltip" role="status"><strong>{hoveredActivity.name}</strong><span>{number(hoveredActivity.value)} personel · {percent(hoveredActivity.value, total).toFixed(1)}%</span></div>}</div>
        <div className="activity-legend" aria-label="Legenda warna activity">{activities.map((item, index) => <div className="activity-legend-item" key={item.name}><span className="activity-swatch" style={{ backgroundColor: activityColors[index % activityColors.length] }}/><span className="activity-name">{item.name}</span></div>)}</div>
        {!total && <p className="chart-footnote">Tidak ada data activity pada hasil filter.</p>}
      </SectionCard>
    </div>
    <div className="snapshot-bottom">
      <SectionCard title="Masa kerja" subtitle="Dihitung dari tanggal masuk" className="snapshot-card">
        <div className="tenure-chart">{tenureRows.map(row => <button type="button" key={row.group} className={`tenure-row ${filters.tenureGroup.includes(row.group) ? 'chart-active' : ''}`} onClick={() => toggleCategory('tenureGroup', row.group)}><span className="tenure-top"><span>{row.group} tahun</span><strong>{number(row.total)} <small>({percent(row.total, total).toFixed(1)}%)</small></strong></span><span className="tenure-track"><span className="tenure-fill" style={{ width: `${row.total / tenureMax * 100}%` }}><i style={{ width: `${row.total ? row.male / row.total * 100 : 0}%` }}/><i style={{ width: `${row.total ? row.female / row.total * 100 : 0}%` }}/><i style={{ width: `${row.total ? row.unknown / row.total * 100 : 0}%` }}/></span></span></button>)}</div>
        <p className="chart-footnote chart-key"><span><i className="legend-dot male-dot"/>Laki-laki</span><span><i className="legend-dot female-dot"/>Perempuan</span>{unknown > 0 && <span><i className="legend-dot unknown-dot"/>Tidak diketahui</span>}</p>
      </SectionCard>
      <SectionCard title="Distribusi pendidikan" subtitle="Jenjang formal pada data" className="snapshot-card">
        <RankedBars data={education} total={total} selected={filters.education} onSelect={name => toggleCategory('education', name)} tone="education"/>
      </SectionCard>
      <SectionCard title="Konsentrasi per divisi" subtitle={`${divisions.length} unit pada hasil filter`} className="snapshot-card">
        <RankedBars data={shownDivisions} total={total} selected={filters.division} onSelect={name => toggleCategory('division', name)} tone="division"/>
        {divisions.length > 10 && <button type="button" className="chart-more" onClick={() => setShowAllDivisions(!showAllDivisions)}>{showAllDivisions ? 'Tampilkan 10 teratas' : `Lihat semua ${divisions.length} unit`}</button>}
      </SectionCard>
      <section className="section-card snapshot-card workforce-ai-card" aria-label="AI Workforce Intelligence">
        <div className="workforce-ai-header"><span className="workforce-ai-mark"><Sparkles size={18}/></span><div><h2>Chatbot SDM</h2><p>Tanya tentang data periode aktif</p></div></div>
        <ChatPanel key={`${JSON.stringify(filters)}:${query}`} sessionId={sessionId} filters={filters} query={query} count={total}/>
      </section>
    </div>
  </div>
}
