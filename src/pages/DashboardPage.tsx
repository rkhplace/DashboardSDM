import { useMemo, useState } from 'react'
import { FileDown, FileSpreadsheet, FileUp, X } from 'lucide-react'
import { Link, useLocation } from 'react-router'
import { hasContractColumn, projectContracts } from '../analytics/contracts'
import { pruneFilters } from '../analytics/filters'
import { formatNumber } from '../analytics/format'
import { monthLabel } from '../analytics/periods'
import { DEFAULT_RETIREMENT_AGE, defaultRetirementStatuses, projectRetirement, type RetirementSettings } from '../analytics/retirement'
import { compareSnapshots, periodSeries } from '../analytics/trends'
import { boardUnits, filterRecords } from '../analytics/workforce'
import { BandMatrix } from '../components/BandMatrix'
import { ContractPanel, type FollowUpData } from '../components/ContractPanel'
import { EmployeeTable } from '../components/EmployeeTable'
import { FilterBar } from '../components/FilterBar'
import { FilterDropdown } from '../components/FilterDropdown'
import { KpiSection } from '../components/KpiSection'
import { PrintReport } from '../components/PrintReport'
import { RetirementPanel } from '../components/RetirementPanel'
import { SnapshotCharts } from '../components/SnapshotCharts'
import { StatusPanel } from '../components/StatusPanel'
import { TrendPanel, type TrendData } from '../components/TrendPanel'
import { useWorkforceSession } from '../data/useWorkforceSession'
import { buildReport } from '../report/reportData'
import { emptyFilters } from '../types/workforce'

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
    const earlier = history
      .map(item => item.period)
      .filter(period => period < snapshot.period)
      .sort()
    return compareWith && earlier.includes(compareWith) ? compareWith : earlier[earlier.length - 1]
  }, [history, snapshot.period, compareWith])
  const [switchError, setSwitchError] = useState('')
  const periodOptions = useMemo(
    () => [...new Set([...periods.map(item => item.period), snapshot.period])].sort().reverse(),
    [periods, snapshot.period],
  )
  async function switchPeriod(period: string) {
    if (period === snapshot.period) return
    setSwitching(true)
    setSwitchError('')
    try {
      await openPeriod(period)
    } catch (cause) {
      setSwitchError(cause instanceof Error ? cause.message : 'Periode gagal dibuka.')
    } finally {
      setSwitching(false)
    }
  }
  const [filters, setFilters] = useState(emptyFilters)
  const records = useMemo(() => filterRecords(snapshot.records, filters, snapshot.asOf), [snapshot, filters])
  const outsideDivisions = useMemo(() => boardUnits(snapshot.records), [snapshot])
  const statusOptions = useMemo(
    () => [...new Set(snapshot.records.map(record => record.status))].sort((a, b) => a.localeCompare(b, 'id')),
    [snapshot],
  )
  const [retirementSettings, setRetirementSettings] = useState<RetirementSettings>(() => ({
    age: DEFAULT_RETIREMENT_AGE,
    horizonYears: 5,
    statuses: defaultRetirementStatuses(snapshot.records),
  }))
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
  const trendSnapshots = useMemo(
    () =>
      [...history.filter(item => item.period !== snapshot.period), snapshot]
        .filter(item => item.period <= snapshot.period)
        .sort((a, b) => a.period.localeCompare(b.period)),
    [history, snapshot],
  )
  const series = useMemo(
    () => periodSeries(trendSnapshots, filters, retirementSettings.age),
    [trendSnapshots, filters, retirementSettings.age],
  )
  const movement = useMemo(() => {
    const previous = trendSnapshots.find(item => item.period === effectiveCompare)
    return previous ? compareSnapshots(previous, snapshot, filters, retirementSettings.age) : null
  }, [trendSnapshots, effectiveCompare, snapshot, filters, retirementSettings.age])
  const trend = useMemo<TrendData>(
    () => ({ snapshots: trendSnapshots, series, movement, compareWith: effectiveCompare ?? null, saved: periods.length }),
    [trendSnapshots, series, movement, effectiveCompare, periods.length],
  )
  const followUp = useMemo<FollowUpData>(() => {
    const previous = movement && trendSnapshots.find(item => item.period === movement.from)
    return movement && previous
      ? { from: movement.from, items: movement.contractFollowUps, hasContractColumn: hasContractColumn(previous.records) }
      : null
  }, [movement, trendSnapshots])
  const contractColumn = hasContractColumn(snapshot.records)
  const contractProjection = useMemo(
    () => (contractColumn ? projectContracts(records, snapshot.asOf, contractMonths) : null),
    [contractColumn, records, snapshot.asOf, contractMonths],
  )
  const report = useMemo(
    () =>
      buildReport(snapshot, filters, records, projection, retirementSettings, {
        contracts: contractProjection ? { months: contractMonths, projection: contractProjection, followUp } : null,
        trend: { series, movement },
      }),
    [snapshot, filters, records, projection, retirementSettings, contractProjection, contractMonths, followUp, series, movement],
  )
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
  return (
    <main className="page dashboard-page">
      <div className="page-heading">
        <div className="dashboard-heading-copy">
          <div className="dashboard-title-row">
            <img src="/images__5_-removebg-preview.png" alt="Logo INTI" />
            <div className="dashboard-title-text">
              <h1>Dashboard SDM</h1>
              <div className="dashboard-period-row">
                <div className="dashboard-period-picker" aria-busy={switching}>
                  <FilterDropdown
                    label="Periode data"
                    allowAll={false}
                    options={periodOptions}
                    selected={[snapshot.period]}
                    display={monthLabel}
                    onChange={([value]) => {
                      if (value) void switchPeriod(value)
                    }}
                  />
                </div>
                <p className="dashboard-period">
                  {formatNumber(snapshot.records.length)} karyawan · {snapshot.sourceFile}
                  {periodOptions.length > 1 ? ` · ${periodOptions.length} periode tersimpan` : ''}
                </p>
              </div>
            </div>
          </div>
        </div>
        <div className="page-actions">
          <Link to="/impor" className="button soft">
            <FileUp size={15} /> Upload data lain
          </Link>
          <button className="button outline" onClick={() => window.print()} title="Buka dialog cetak, lalu pilih Simpan sebagai PDF">
            <FileDown size={15} /> Laporan PDF
          </button>
          <button
            className="button primary"
            onClick={() => {
              void downloadExcel()
            }}
            disabled={exporting}
          >
            <FileSpreadsheet size={15} /> {exporting ? 'Menyiapkan...' : 'Ekspor Excel'}
          </button>
        </div>
      </div>
      {exportError && (
        <p className="landing-error" role="alert">
          {exportError}
        </p>
      )}
      {switchError && (
        <p className="landing-error" role="alert">
          {switchError}
        </p>
      )}
      {notSaved && (
        <p className="dq-status dq-status-warning" role="status">
          Periode ini tidak tersimpan di browser (penyimpanan diblokir atau penuh). Dashboard tetap bisa dipakai, tetapi data hilang saat
          halaman ditutup dan tidak ikut analisis antar-periode.
        </p>
      )}
      {releasedFilters.length > 0 && (
        <p className="dq-status dq-status-warning filter-released" role="status">
          Filter dilepas karena tidak ada di periode {monthLabel(snapshot.period)}: {releasedFilters.join(' · ')}
          <button type="button" className="icon-button" aria-label="Tutup pemberitahuan" onClick={() => setReleasedFilters([])}>
            <X size={14} />
          </button>
        </p>
      )}
      <FilterBar records={snapshot.records} asOf={snapshot.asOf} filters={filters} onChange={setFilters} />
      <KpiSection
        records={records}
        periodTotal={snapshot.records.length}
        period={snapshot.period}
        asOf={snapshot.asOf}
        boardUnits={outsideDivisions}
        onFiltersChange={setFilters}
      />
      <StatusPanel
        records={records}
        selected={filters.status}
        onToggle={status =>
          setFilters(current => ({ ...current, status: current.status.length === 1 && current.status[0] === status ? [] : [status] }))
        }
      />
      <TrendPanel active={snapshot} trend={trend} retirementAge={retirementSettings.age} onCompareChange={setCompareWith} />
      <SnapshotCharts
        key={sessionId}
        records={records}
        asOf={snapshot.asOf}
        filters={filters}
        onChange={setFilters}
        sessionId={sessionId!}
        query=""
        retirement={retirementSettings}
        contractMonths={contractMonths}
        compareWith={effectiveCompare}
      />
      <RetirementPanel
        projection={projection}
        settings={retirementSettings}
        statusOptions={statusOptions}
        onSettingsChange={setRetirementSettings}
        selectedDivisions={filters.division}
        onSelectDivision={division =>
          setFilters(current => ({
            ...current,
            division: current.division.length === 1 && current.division[0] === division ? [] : [division],
          }))
        }
        onClearDivisions={() => setFilters(current => ({ ...current, division: [] }))}
      />
      <ContractPanel
        records={records}
        asOf={snapshot.asOf}
        hasContractColumn={contractColumn}
        months={contractMonths}
        onMonthsChange={setContractMonths}
        followUp={followUp}
      />
      <BandMatrix records={records} />
      <EmployeeTable records={records} asOf={snapshot.asOf} contractColumn={contractColumn} />
      <PrintReport report={report} />
    </main>
  )
}
