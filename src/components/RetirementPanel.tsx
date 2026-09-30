import { useState } from 'react'
import { ArrowLeft, Hourglass, X } from 'lucide-react'
import { RETIREMENT_AGE_OPTIONS, type RetirementProjection, type RetirementSettings } from '../analytics/retirement'
import { FilterDropdown } from './FilterDropdown'

type Props = {
  projection: RetirementProjection
  settings: RetirementSettings
  statusOptions: string[]
  onSettingsChange: (settings: RetirementSettings) => void
  selectedDivisions: string[]
  onSelectDivision: (division: string) => void
  onClearDivisions: () => void
}

const HORIZON_OPTIONS = ['1', '2', '3', '4', '5']
const number = (value: number) => value.toLocaleString('id-ID')
const formatDate = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
const formatMonthsLeft = (months: number, overdue: boolean) => overdue ? 'Lewat usia' : months < 12 ? `${months} bln` : `${Math.floor(months / 12)} th ${months % 12} bln`

export function RetirementPanel({ projection, settings, statusOptions, onSettingsChange, selectedDivisions, onSelectDivision, onClearDivisions }: Props) {
  const [showAll, setShowAll] = useState(false)
  const maxWindow = Math.max(...projection.windows.map(window => window.count), 1)
  const retiring = projection.candidates.length
  const visible = showAll ? projection.candidates : projection.candidates.slice(0, 10)

  return <section className="section-card retirement-card" aria-label="Proyeksi pensiun dan risiko suksesi">
    <div className="section-header retirement-header">
      <div className="retirement-title"><Hourglass size={17}/><div><h2>Proyeksi pensiun &amp; risiko suksesi</h2><p>Dihitung dari tanggal lahir pada hasil filter</p></div></div>
      <div className="retirement-controls">
        <div><span>Usia pensiun</span><FilterDropdown label="Usia pensiun" allowAll={false} options={RETIREMENT_AGE_OPTIONS.map(String)} selected={[String(settings.age)]} display={value => `${value} tahun`} onChange={([value]) => value && onSettingsChange({ ...settings, age: Number(value) })}/></div>
        <div><span>Rentang</span><FilterDropdown label="Rentang proyeksi" allowAll={false} options={HORIZON_OPTIONS} selected={[String(settings.horizonYears)]} display={value => `${value} tahun ke depan`} onChange={([value]) => value && onSettingsChange({ ...settings, horizonYears: Number(value) })}/></div>
        <div><span>Status dihitung</span><FilterDropdown label="Status dihitung" options={statusOptions} selected={settings.statuses} multiple onChange={statuses => onSettingsChange({ ...settings, statuses })}/></div>
      </div>
    </div>
    {selectedDivisions.length > 0 && <div className="retirement-scope" role="status">
      <span>Menampilkan {selectedDivisions.length === 1 ? <>divisi <strong>{selectedDivisions[0]}</strong></> : <><strong>{selectedDivisions.length} divisi</strong> terpilih</>}. Filter ini juga berlaku di seluruh dashboard.</span>
      <button type="button" onClick={onClearDivisions}><ArrowLeft size={14}/> Kembali ke semua divisi</button>
    </div>}
    {settings.statuses.length === 0
      ? <p className="kpi-detail-empty">Pilih minimal satu status karyawan yang dihitung.</p>
      : <>
        <div className="retirement-stats">
          <div className="retirement-stat primary"><span>Pensiun dalam {settings.horizonYears} tahun</span><strong>{number(retiring - projection.overdue)}</strong><small>{projection.counted ? ((retiring - projection.overdue) / projection.counted * 100).toFixed(1) : '0.0'}% dari {number(projection.counted)} karyawan dihitung</small></div>
          <div className="retirement-stat"><span>Posisi struktural terdampak</span><strong>{number(projection.keyRetiring)}</strong><small>Perlu rencana suksesi</small></div>
          <div className="retirement-stat"><span>Sudah melewati usia {settings.age}</span><strong>{number(projection.overdue)}</strong><small>Cek status perpanjangan</small></div>
          <div className="retirement-stat"><span>Tanggal lahir tidak valid</span><strong>{number(projection.invalidBirthDate)}</strong><small>Tidak ikut diproyeksikan</small></div>
        </div>
        <div className="retirement-body">
          <div className="retirement-windows">
            <h3>Jumlah pensiun per 12 bulan</h3>
            {projection.windows.map(window => <div className="retirement-window" key={window.label}>
              <span className="retirement-window-label">{window.label}</span>
              <span className="retirement-window-track"><span style={{ width: `${window.count / maxWindow * 100}%` }}/></span>
              <strong>{number(window.count)}</strong>
              {window.keyCount > 0 && <small>{number(window.keyCount)} struktural</small>}
            </div>)}
          </div>
          <div className="retirement-divisions">
            <h3>Risiko per divisi</h3>
            {projection.divisions.length === 0
              ? <p className="kpi-detail-empty">Tidak ada karyawan yang pensiun dalam rentang ini.</p>
              : <div className="table-scroll"><table className="retirement-table"><thead><tr><th>Divisi</th><th>Dihitung</th><th>Pensiun</th><th>%</th><th>Struktural</th><th>Risiko</th></tr></thead><tbody>
                {projection.divisions.map(item => <tr key={item.division}><td><button type="button" className={`link-button ${selectedDivisions.includes(item.division) ? 'is-selected' : ''}`} onClick={() => onSelectDivision(item.division)} title={selectedDivisions.includes(item.division) ? 'Klik lagi untuk kembali ke semua divisi' : 'Saring dashboard ke divisi ini'}>{item.division}{selectedDivisions.includes(item.division) && <X size={12}/>}</button></td><td>{number(item.counted)}</td><td>{number(item.retiring)}</td><td>{(item.share * 100).toFixed(0)}%</td><td>{item.keyRetiring || '—'}</td><td><span className={`risk-badge risk-${item.risk.toLowerCase()}`}>{item.risk}</span></td></tr>)}
              </tbody></table></div>}
          </div>
        </div>
        {retiring > 0 && <div className="retirement-list">
          <h3>Daftar karyawan ({number(retiring)})</h3>
          <div className="table-scroll"><table className="retirement-table"><thead><tr><th>Nama</th><th>NIP</th><th>Jabatan</th><th>Divisi</th><th>Band</th><th>Tanggal pensiun</th><th>Sisa waktu</th></tr></thead><tbody>
            {visible.map(({ record, retireOn, monthsLeft, overdue, keyPosition }) => <tr key={record.nip} className={overdue ? 'is-overdue' : ''}><td>{record.name}{keyPosition && <span className="key-tag">Struktural</span>}</td><td className="nip-cell">{record.nip}</td><td>{record.position}</td><td>{record.division}</td><td>{record.band ?? '—'}</td><td>{formatDate(retireOn)}</td><td>{formatMonthsLeft(monthsLeft, overdue)}</td></tr>)}
          </tbody></table></div>
          {retiring > 10 && <button type="button" className="chart-more" onClick={() => setShowAll(!showAll)}>{showAll ? 'Tampilkan 10 terdekat' : `Lihat semua ${number(retiring)} karyawan`}</button>}
        </div>}
        <p className="chart-footnote">Asumsi: pensiun pada tanggal mencapai usia {settings.age} tahun; posisi kunci = jenis jabatan struktural. Risiko tinggi bila ≥20% karyawan divisi pensiun atau ada posisi struktural yang pensiun; sedang bila ≥10%. Sesuaikan usia pensiun dengan peraturan perusahaan.</p>
      </>}
  </section>
}
