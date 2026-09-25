import { useEffect, useMemo, useState } from 'react'
import { Building2, ChevronDown, Clock3, Download, FileUp, IdCard, Mars, Search, UsersRound, Venus, X } from 'lucide-react'
import { Link } from 'react-router'
import { ageGroup, bandMatrix, countBy, filterRecords, fullYears, genderOf, summarize } from '../analytics/workforce'
import { FilterBar } from '../components/FilterBar'
import { EmployeeTable } from '../components/EmployeeTable'
import { SectionCard } from '../components/SectionCard'
import { SnapshotCharts } from '../components/SnapshotCharts'
import { useWorkforceSession } from '../data/useWorkforceSession'
import { emptyFilters, type EmployeeRecord } from '../types/workforce'

const number = (value: number) => value.toLocaleString('id-ID')

function exportCsv(records: EmployeeRecord[], period: string) {
  const header = ['NIP', 'NAMA', 'BAND', 'JABATAN', 'DIREKTORAT', 'DIVISI', 'STATUS']
  const rows = records.map(record => [record.nip, record.name, record.band ?? '', record.position, record.directorate, record.division, record.status])
  const csv = [header, ...rows].map(row => row.map(value => `"${String(value).replaceAll('"', '""')}"`).join(',')).join('\r\n')
  const url = URL.createObjectURL(new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = `inti-sdm-${period}.csv`
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

type Distribution = { name: string; value: number }
type KpiKey = 'total' | 'active' | 'age' | 'male' | 'female' | 'units'

function BreakdownBars({ data, total, onSelect }: { data: Distribution[]; total: number; onSelect: (name: string) => void }) {
  if (!data.length) return <p className="kpi-detail-empty">Tidak ada data yang sesuai dengan filter.</p>
  return <div className="breakdown-list">{data.map(item => {
    const percent = total ? item.value / total * 100 : 0
    return <button type="button" className="breakdown-item" key={item.name} onClick={() => onSelect(item.name)} aria-label={`Filter ${item.name}, ${number(item.value)} karyawan, ${percent.toFixed(1)} persen`}><span className="breakdown-label">{item.name}</span><span className="breakdown-track"><span style={{ width: `${percent}%` }}/></span><span className="breakdown-value">{number(item.value)} <small>{percent.toFixed(1)}%</small></span></button>
  })}</div>
}

export function DashboardPage() {
  const { snapshot: activeSnapshot, sessionId } = useWorkforceSession()
  const snapshot = activeSnapshot!
  const [filters, setFilters] = useState(emptyFilters)
  const [matrixQuery, setMatrixQuery] = useState('')
  const [selectedKpi, setSelectedKpi] = useState<KpiKey | null>(null)
  useEffect(() => {
    if (selectedKpi) document.getElementById('kpi-detail')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [selectedKpi])
  const records = useMemo(() => filterRecords(snapshot.records, filters, snapshot.asOf), [snapshot, filters])
  const summary = useMemo(() => summarize(records, snapshot.asOf), [records, snapshot])
  const statuses = useMemo(() => countBy(records, record => record.status), [records])
  const gender = useMemo(() => countBy(records, record => genderOf(record) === 'L' ? 'Laki-laki' : genderOf(record) === 'P' ? 'Perempuan' : 'Tidak diketahui'), [records])
  const age = useMemo(() => countBy(records, record => ageGroup(fullYears(record.birthDate, snapshot.asOf))), [records, snapshot])
  const divisions = useMemo(() => countBy(records, record => record.division), [records])
  const matrix = useMemo(() => bandMatrix(records), [records])
  const visibleMatrixRows = useMemo(() => {
    const search = matrixQuery.toLocaleLowerCase('id').trim()
    return search ? matrix.rows.filter(row => row.division.toLocaleLowerCase('id').includes(search)) : matrix.rows
  }, [matrix, matrixQuery])
  const visibleMatrixTotals = matrix.bands.map((_, index) => visibleMatrixRows.reduce((sum, row) => sum + row.counts[index], 0))
  const visibleMatrixTotal = visibleMatrixRows.reduce((sum, row) => sum + row.total, 0)
  const percent = (value: number) => summary.total ? value / summary.total * 100 : 0
  const kpis = [
    { key: 'total', label: 'Total karyawan', value: number(summary.total), suffix: '', note: 'Data pada hasil filter', share: snapshot.records.length ? summary.total / snapshot.records.length * 100 : 0, icon: UsersRound },
    { key: 'active', label: 'Karyawan aktif', value: number(summary.active), suffix: '', note: `${percent(summary.active).toFixed(1)}% dari hasil filter`, share: percent(summary.active), icon: IdCard },
    { key: 'age', label: 'Rata-rata usia', value: summary.averageAge == null ? '—' : summary.averageAge.toFixed(1), suffix: 'tahun', note: `${number(summary.ageDenominator)} tanggal lahir valid`, share: undefined, icon: Clock3 },
    { key: 'male', label: 'Laki-laki', value: number(summary.male), suffix: `${percent(summary.male).toFixed(1)}%`, note: `${number(summary.male)} orang`, share: percent(summary.male), icon: Mars },
    { key: 'female', label: 'Perempuan', value: number(summary.female), suffix: `${percent(summary.female).toFixed(1)}%`, note: `${number(summary.female)} orang`, share: percent(summary.female), icon: Venus },
    { key: 'units', label: 'Jumlah divisi', value: number(summary.units), suffix: 'unit', note: 'Divisi pada hasil filter', share: undefined, icon: Building2 },
  ] satisfies { key: KpiKey; label: string; value: string; suffix: string; note: string; share?: number; icon: typeof UsersRound }[]
  const detail = selectedKpi === 'age'
    ? { title: 'Rincian kelompok usia', data: age, firstColumn: 'Usia' }
    : selectedKpi === 'male' || selectedKpi === 'female'
      ? { title: 'Rincian jenis kelamin', data: gender, firstColumn: 'Jenis kelamin' }
      : selectedKpi === 'units'
        ? { title: 'Rincian per unit', data: divisions, firstColumn: 'Divisi / Unit' }
        : { title: 'Rincian status karyawan', data: statuses, firstColumn: 'Status' }

  function selectDetail(name: string) {
    if (selectedKpi === 'age') setFilters(current => ({ ...current, ageGroup: [name] }))
    else if (selectedKpi === 'male' || selectedKpi === 'female') {
      const gender = name === 'Laki-laki' ? 'L' : name === 'Perempuan' ? 'P' : 'UNKNOWN'
      setFilters(current => ({ ...current, gender: [gender] }))
    } else if (selectedKpi === 'units') setFilters(current => ({ ...current, division: [name] }))
    else setFilters(current => ({ ...current, status: [name] }))
    setSelectedKpi(null)
  }
  return <main className="page dashboard-page">
    <div className="page-heading"><div className="dashboard-heading-copy"><div className="dashboard-title-row"><img src="/images__5_-removebg-preview.png" alt="Logo INTI"/><div className="dashboard-title-text"><h1>Dashboard SDM</h1><p className="dashboard-period">Periode {snapshot.period} · {number(snapshot.records.length)} karyawan · {snapshot.sourceFile}</p></div></div></div><div className="page-actions"><Link to="/impor" className="button soft"><FileUp size={15}/> Upload data lain</Link><button className="button outline" onClick={() => window.print()}>Cetak</button><button className="button primary" onClick={() => exportCsv(records, snapshot.period)}><Download size={15}/> Ekspor CSV</button></div></div>
    <FilterBar records={snapshot.records} asOf={snapshot.asOf} filters={filters} onChange={setFilters}/>
    <div className="kpi-grid">{kpis.map(kpi => <button key={kpi.key} type="button" className={`kpi-card kpi-button ${kpi.key === 'total' ? 'kpi-primary' : ''} ${selectedKpi === kpi.key ? 'kpi-selected' : ''}`} aria-expanded={selectedKpi === kpi.key} aria-controls="kpi-detail" onClick={() => setSelectedKpi(selectedKpi === kpi.key ? null : kpi.key)}><span className="kpi-top"><span>{kpi.label}</span><span className="kpi-icon"><kpi.icon size={16} strokeWidth={2.2}/></span></span><span className="kpi-figure"><strong>{kpi.value}</strong>{kpi.suffix && <span>{kpi.suffix}</span>}</span><span className="kpi-footer"><small>{kpi.note}</small>{kpi.share !== undefined && <span className="kpi-meter" aria-hidden="true"><span style={{ width: `${kpi.share}%` }}/></span>}</span><ChevronDown className="kpi-chevron" size={13} aria-hidden="true"/></button>)}</div>
    {selectedKpi && <section id="kpi-detail" className="kpi-detail" aria-label={detail.title}><div className="kpi-detail-head"><div><h2>{detail.title}</h2><p>Komposisi {detail.firstColumn.toLowerCase()} pada periode {snapshot.period}. Pilih kategori untuk menyaring dashboard.</p></div><button type="button" className="icon-button" aria-label="Tutup rincian" onClick={() => setSelectedKpi(null)}><X size={18}/></button></div><BreakdownBars data={detail.data} total={records.length} onSelect={selectDetail}/>{selectedKpi === 'total' && <button type="button" className="kpi-reset" onClick={() => { setFilters(emptyFilters); setSelectedKpi(null) }}>Tampilkan semua data</button>}</section>}
    <section className="status-panel section-card" aria-label="Distribusi status kepegawaian dan penugasan"><div className="status-panel-head"><div className="status-panel-title"><IdCard size={17}/><h2>Distribusi status kepegawaian &amp; penugasan</h2></div><p>{statuses.length} klasifikasi status <span>•</span> Total {number(records.length)} personel</p></div><div className="status-grid">{statuses.map(item => <button type="button" key={item.name} className={`status-item ${filters.status.includes(item.name) ? 'status-selected' : ''}`} onClick={() => setFilters(current => ({ ...current, status: current.status.length === 1 && current.status[0] === item.name ? [] : [item.name] }))} aria-label={`Filter status ${item.name}, ${number(item.value)} orang`}><span title={item.name}>{item.name}</span><div><strong>{number(item.value)}</strong><small>{records.length ? (item.value / records.length * 100).toFixed(1) : '0.0'}%</small></div></button>)}</div>{statuses.length === 0 && <p className="status-empty">Tidak ada status pada hasil filter.</p>}</section>
    <SnapshotCharts records={records} asOf={snapshot.asOf} filters={filters} onChange={setFilters} sessionId={sessionId!} query=""/>
    <SectionCard title="Matriks klasifikasi band jabatan per unit" subtitle="Band kosong tetap dihitung pada kolom Tidak tersedia" className="matrix-section" headerAction={<label className="matrix-search-box"><Search size={16}/><input value={matrixQuery} onChange={event => setMatrixQuery(event.target.value)} placeholder="Cari unit di matriks" aria-label="Cari unit di matriks klasifikasi"/>{matrixQuery && <button type="button" onClick={() => setMatrixQuery('')} aria-label="Hapus pencarian matriks"><X size={15}/></button>}</label>}><div className="table-scroll" role="region" aria-label="Matriks klasifikasi band jabatan, dapat digulir" tabIndex={0}><table className="matrix-table"><thead><tr><th>Unit / Band</th>{matrix.bands.map(band => <th key={band}>{band}</th>)}<th>Total</th></tr></thead><tbody>{visibleMatrixRows.map(row => <tr key={row.division}><td>{row.division}</td>{row.counts.map((count, index) => <td key={matrix.bands[index]}>{count || '—'}</td>)}<td><strong>{row.total}</strong></td></tr>)}{!visibleMatrixRows.length && <tr><td colSpan={matrix.bands.length + 2}>Tidak ada unit yang cocok dengan pencarian.</td></tr>}<tr className="total-row"><td>Total hasil</td>{visibleMatrixTotals.map((count, index) => <td key={matrix.bands[index]}>{count}</td>)}<td>{visibleMatrixTotal}</td></tr></tbody></table></div></SectionCard>
    <EmployeeTable records={records} asOf={snapshot.asOf}/>
  </main>
}
