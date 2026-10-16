import { useEffect, useMemo, useState } from 'react'
import { Building2, ChevronDown, Clock3, FileDown, FileSpreadsheet, FileUp, IdCard, Mars, Search, UsersRound, Venus, X } from 'lucide-react'
import { Link, useLocation } from 'react-router'
import { hasContractColumn, monthLabel, projectContracts } from '../analytics/contracts'
import { DEFAULT_RETIREMENT_AGE, defaultRetirementStatuses, projectRetirement, type RetirementSettings } from '../analytics/retirement'
import { ageGroup, bandMatrix, countBy, filterRecords, fullYears, genderOf, summarize } from '../analytics/workforce'
import { compareSnapshots, periodSeries } from '../analytics/trends'
import { ContractPanel, type FollowUpData } from '../components/ContractPanel'
import { FilterBar } from '../components/FilterBar'
import { FilterDropdown } from '../components/FilterDropdown'
import { EmployeeTable } from '../components/EmployeeTable'
import { PrintReport } from '../components/PrintReport'
import { RetirementPanel } from '../components/RetirementPanel'
import { SectionCard } from '../components/SectionCard'
import { SnapshotCharts } from '../components/SnapshotCharts'
import { TrendPanel, type TrendData } from '../components/TrendPanel'
import { useWorkforceSession } from '../data/useWorkforceSession'
import { buildReport } from '../report/reportData'
import { emptyFilters } from '../types/workforce'
import { pruneFilters } from '../analytics/filters'

const number = (value: number) => value.toLocaleString('id-ID')

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
  const { snapshot: activeSnapshot, sessionId, history, periods, openPeriod, storage } = useWorkforceSession()
  const snapshot = activeSnapshot!
  const location = useLocation()
  const notSaved = Boolean((location.state as { notSaved?: boolean } | null)?.notSaved) || storage === 'unavailable'
  const [switching, setSwitching] = useState(false)
  const [contractMonths, setContractMonths] = useState(6)
  const [compareWith, setCompareWith] = useState<string | null>(null)
  // The period the trend panel actually compares with: the chosen one if it is still earlier than the active period, else the latest earlier one.
  const effectiveCompare = useMemo(() => {
    const earlier = history.map(item => item.period).filter(period => period < snapshot.period).sort()
    return compareWith && earlier.includes(compareWith) ? compareWith : earlier[earlier.length - 1]
  }, [history, snapshot.period, compareWith])
  const [switchError, setSwitchError] = useState('')
  const periodOptions = useMemo(() => [...new Set([...periods.map(item => item.period), snapshot.period])].sort().reverse(), [periods, snapshot.period])
  async function switchPeriod(period: string) {
    if (period === snapshot.period) return
    setSwitching(true)
    setSwitchError('')
    try { await openPeriod(period) } catch (cause) { setSwitchError(cause instanceof Error ? cause.message : 'Periode gagal dibuka.') } finally { setSwitching(false) }
  }
  const [filters, setFilters] = useState(emptyFilters)
  const [matrixQuery, setMatrixQuery] = useState('')
  const [selectedKpi, setSelectedKpi] = useState<KpiKey | null>(null)
  useEffect(() => {
    if (selectedKpi) document.getElementById('kpi-detail')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [selectedKpi])
  const records = useMemo(() => filterRecords(snapshot.records, filters, snapshot.asOf), [snapshot, filters])
  const statusOptions = useMemo(() => [...new Set(snapshot.records.map(record => record.status))].sort((a, b) => a.localeCompare(b, 'id')), [snapshot])
  const [retirementSettings, setRetirementSettings] = useState<RetirementSettings>(() => ({ age: DEFAULT_RETIREMENT_AGE, horizonYears: 5, statuses: defaultRetirementStatuses(snapshot.records) }))
  // When another period opens: statuses that are new in it join the retirement projection by the usual rule,
  // and filter values that do not exist in it are released (with a note) instead of silently emptying the dashboard.
  const [seenPeriod, setSeenPeriod] = useState(snapshot.period)
  const [knownStatuses, setKnownStatuses] = useState(() => new Set(snapshot.records.map(record => record.status)))
  const [releasedFilters, setReleasedFilters] = useState<string[]>([])
  if (seenPeriod !== snapshot.period) {
    setSeenPeriod(snapshot.period)
    const added = defaultRetirementStatuses(snapshot.records).filter(status => !knownStatuses.has(status))
    if (added.length) setRetirementSettings(current => ({ ...current, statuses: [...new Set([...current.statuses, ...added])] }))
    setKnownStatuses(new Set([...knownStatuses, ...snapshot.records.map(record => record.status)]))
    const pruned = pruneFilters(filters, snapshot.records, snapshot.asOf)
    if (pruned.released.length) setFilters(pruned.filters)
    setReleasedFilters(pruned.released)
  }
  const projection = useMemo(() => projectRetirement(records, snapshot.asOf, retirementSettings), [records, snapshot, retirementSettings])
  // Trend data is computed once here and shared by the trend panel, the contract follow-ups and the report.
  // The active snapshot always takes part (even if saving it failed); later periods are left out of "now".
  const trendSnapshots = useMemo(() => [...history.filter(item => item.period !== snapshot.period), snapshot].filter(item => item.period <= snapshot.period).sort((a, b) => a.period.localeCompare(b.period)), [history, snapshot])
  const series = useMemo(() => periodSeries(trendSnapshots, filters, retirementSettings.age), [trendSnapshots, filters, retirementSettings.age])
  const movement = useMemo(() => {
    const previous = trendSnapshots.find(item => item.period === effectiveCompare)
    return previous ? compareSnapshots(previous, snapshot, filters, retirementSettings.age) : null
  }, [trendSnapshots, effectiveCompare, snapshot, filters, retirementSettings.age])
  const trend = useMemo<TrendData>(() => ({ snapshots: trendSnapshots, series, movement, compareWith: effectiveCompare ?? null, saved: periods.length }), [trendSnapshots, series, movement, effectiveCompare, periods.length])
  const followUp = useMemo<FollowUpData>(() => {
    const previous = movement && trendSnapshots.find(item => item.period === movement.from)
    return movement && previous ? { from: movement.from, items: movement.contractFollowUps, hasContractColumn: hasContractColumn(previous.records) } : null
  }, [movement, trendSnapshots])
  const contractColumn = hasContractColumn(snapshot.records)
  const contractProjection = useMemo(() => contractColumn ? projectContracts(records, snapshot.asOf, contractMonths) : null, [contractColumn, records, snapshot.asOf, contractMonths])
  const report = useMemo(() => buildReport(snapshot, filters, records, projection, retirementSettings, {
    contracts: contractProjection ? { months: contractMonths, projection: contractProjection, followUp } : null,
    trend: { series, movement },
  }), [snapshot, filters, records, projection, retirementSettings, contractProjection, contractMonths, followUp, series, movement])
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState('')
  async function downloadExcel() {
    setExporting(true)
    setExportError('')
    try {
      const { exportExcel } = await import('../report/exportExcel')
      await exportExcel(report, `laporan-sdm-inti-${snapshot.period}.xlsx`)
    } catch {
      setExportError('File Excel gagal dibuat. Coba lagi.')
    } finally {
      setExporting(false)
    }
  }
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
    <div className="page-heading"><div className="dashboard-heading-copy"><div className="dashboard-title-row"><img src="/images__5_-removebg-preview.png" alt="Logo INTI"/><div className="dashboard-title-text"><h1>Dashboard SDM</h1><div className="dashboard-period-row"><div className="dashboard-period-picker" aria-busy={switching}><FilterDropdown label="Periode data" allowAll={false} options={periodOptions} selected={[snapshot.period]} display={monthLabel} onChange={([value]) => { if (value) void switchPeriod(value) }}/></div><p className="dashboard-period">{number(snapshot.records.length)} karyawan · {snapshot.sourceFile}{periodOptions.length > 1 ? ` · ${periodOptions.length} periode tersimpan` : ''}</p></div></div></div></div><div className="page-actions"><Link to="/impor" className="button soft"><FileUp size={15}/> Upload data lain</Link><button className="button outline" onClick={() => window.print()} title="Buka dialog cetak, lalu pilih Simpan sebagai PDF"><FileDown size={15}/> Laporan PDF</button><button className="button primary" onClick={() => { void downloadExcel() }} disabled={exporting}><FileSpreadsheet size={15}/> {exporting ? 'Menyiapkan...' : 'Ekspor Excel'}</button></div></div>
    {exportError && <p className="landing-error" role="alert">{exportError}</p>}
    {switchError && <p className="landing-error" role="alert">{switchError}</p>}
    {notSaved && <p className="dq-status dq-status-warning" role="status">Periode ini tidak tersimpan di browser (penyimpanan diblokir atau penuh). Dashboard tetap bisa dipakai, tetapi data hilang saat halaman ditutup dan tidak ikut analisis antar-periode.</p>}
    {releasedFilters.length > 0 && <p className="dq-status dq-status-warning filter-released" role="status">Filter dilepas karena tidak ada di periode {monthLabel(snapshot.period)}: {releasedFilters.join(' · ')}<button type="button" className="icon-button" aria-label="Tutup pemberitahuan" onClick={() => setReleasedFilters([])}><X size={14}/></button></p>}
    <FilterBar records={snapshot.records} asOf={snapshot.asOf} filters={filters} onChange={setFilters}/>
    <div className="kpi-grid">{kpis.map(kpi => <button key={kpi.key} type="button" className={`kpi-card kpi-button ${kpi.key === 'total' ? 'kpi-primary' : ''} ${selectedKpi === kpi.key ? 'kpi-selected' : ''}`} aria-expanded={selectedKpi === kpi.key} aria-controls="kpi-detail" onClick={() => setSelectedKpi(selectedKpi === kpi.key ? null : kpi.key)}><span className="kpi-top"><span>{kpi.label}</span><span className="kpi-icon"><kpi.icon size={16} strokeWidth={2.2}/></span></span><span className="kpi-figure"><strong>{kpi.value}</strong>{kpi.suffix && <span>{kpi.suffix}</span>}</span><span className="kpi-footer"><small>{kpi.note}</small>{kpi.share !== undefined && <span className="kpi-meter" aria-hidden="true"><span style={{ width: `${kpi.share}%` }}/></span>}</span><ChevronDown className="kpi-chevron" size={13} aria-hidden="true"/></button>)}</div>
    {selectedKpi && <section id="kpi-detail" className="kpi-detail" aria-label={detail.title}><div className="kpi-detail-head"><div><h2>{detail.title}</h2><p>Komposisi {detail.firstColumn.toLowerCase()} pada periode {snapshot.period}. Pilih kategori untuk menyaring dashboard.</p></div><button type="button" className="icon-button" aria-label="Tutup rincian" onClick={() => setSelectedKpi(null)}><X size={18}/></button></div><BreakdownBars data={detail.data} total={records.length} onSelect={selectDetail}/>{selectedKpi === 'total' && <button type="button" className="kpi-reset" onClick={() => { setFilters(emptyFilters); setSelectedKpi(null) }}>Tampilkan semua data</button>}</section>}
    <section className="status-panel section-card" aria-label="Distribusi status kepegawaian dan penugasan"><div className="status-panel-head"><div className="status-panel-title"><IdCard size={17}/><h2>Distribusi status kepegawaian &amp; penugasan</h2></div><p>{statuses.length} klasifikasi status <span>•</span> Total {number(records.length)} personel</p></div><div className="status-grid">{statuses.map(item => <button type="button" key={item.name} className={`status-item ${filters.status.includes(item.name) ? 'status-selected' : ''}`} onClick={() => setFilters(current => ({ ...current, status: current.status.length === 1 && current.status[0] === item.name ? [] : [item.name] }))} aria-label={`Filter status ${item.name}, ${number(item.value)} orang`}><span title={item.name}>{item.name}</span><div><strong>{number(item.value)}</strong><small>{records.length ? (item.value / records.length * 100).toFixed(1) : '0.0'}%</small></div></button>)}</div>{statuses.length === 0 && <p className="status-empty">Tidak ada status pada hasil filter.</p>}</section>
    <TrendPanel active={snapshot} trend={trend} retirementAge={retirementSettings.age} onCompareChange={setCompareWith}/>
    <SnapshotCharts key={sessionId} records={records} asOf={snapshot.asOf} filters={filters} onChange={setFilters} sessionId={sessionId!} query="" retirement={retirementSettings} contractMonths={contractMonths} compareWith={effectiveCompare}/>
    <RetirementPanel projection={projection} settings={retirementSettings} statusOptions={statusOptions} onSettingsChange={setRetirementSettings} selectedDivisions={filters.division} onSelectDivision={division => setFilters(current => ({ ...current, division: current.division.length === 1 && current.division[0] === division ? [] : [division] }))} onClearDivisions={() => setFilters(current => ({ ...current, division: [] }))}/>
    <ContractPanel records={records} asOf={snapshot.asOf} hasContractColumn={contractColumn} months={contractMonths} onMonthsChange={setContractMonths} followUp={followUp}/>
    <SectionCard title="Matriks klasifikasi band jabatan per unit" subtitle="Band kosong tetap dihitung pada kolom Tidak tersedia" className="matrix-section" headerAction={<label className="matrix-search-box"><Search size={16}/><input value={matrixQuery} onChange={event => setMatrixQuery(event.target.value)} placeholder="Cari unit di matriks" aria-label="Cari unit di matriks klasifikasi"/>{matrixQuery && <button type="button" onClick={() => setMatrixQuery('')} aria-label="Hapus pencarian matriks"><X size={15}/></button>}</label>}><div className="table-scroll" role="region" aria-label="Matriks klasifikasi band jabatan, dapat digulir" tabIndex={0}><table className="matrix-table"><thead><tr><th>Unit / Band</th>{matrix.bands.map(band => <th key={band}>{band}</th>)}<th>Total</th></tr></thead><tbody>{visibleMatrixRows.map(row => <tr key={row.division}><td>{row.division}</td>{row.counts.map((count, index) => <td key={matrix.bands[index]}>{count || '—'}</td>)}<td><strong>{row.total}</strong></td></tr>)}{!visibleMatrixRows.length && <tr><td colSpan={matrix.bands.length + 2}>Tidak ada unit yang cocok dengan pencarian.</td></tr>}<tr className="total-row"><td>Total hasil</td>{visibleMatrixTotals.map((count, index) => <td key={matrix.bands[index]}>{count}</td>)}<td>{visibleMatrixTotal}</td></tr></tbody></table></div></SectionCard>
    <EmployeeTable records={records} asOf={snapshot.asOf} contractColumn={contractColumn}/>
    <PrintReport report={report}/>
  </main>
}
