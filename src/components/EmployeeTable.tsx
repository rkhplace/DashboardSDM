import { useState } from 'react'
import { ChevronLeft, ChevronRight, RotateCcw, Search } from 'lucide-react'
import { educationOf, fullYears, genderOf } from '../analytics/workforce'
import type { EmployeeRecord } from '../types/workforce'
import { FilterDropdown } from './FilterDropdown'

const PAGE_SIZE = 50

export function EmployeeTable({ records, asOf }: { records: EmployeeRecord[]; asOf: string }) {
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const [localFilters, setLocalFilters] = useState({ status: '', gender: '', division: '', activity: '' })
  const statuses = [...new Set([...records.map(record => record.status), localFilters.status].filter(Boolean))].sort()
  const divisions = [...new Set([...records.map(record => record.division || 'Tidak diketahui'), localFilters.division].filter(Boolean))].sort()
  const activities = [...new Set([...records.map(record => record.activity?.trim() || '(KOSONG)'), localFilters.activity].filter(Boolean))].sort()
  const search = query.toLocaleLowerCase('id').trim()
  const matched = records.filter(record =>
    (!search || `${record.nip} ${record.name} ${record.position} ${record.division}`.toLocaleLowerCase('id').includes(search))
    && (!localFilters.status || record.status === localFilters.status)
    && (!localFilters.gender || genderOf(record) === localFilters.gender)
    && (!localFilters.division || (record.division || 'Tidak diketahui') === localFilters.division)
    && (!localFilters.activity || (record.activity?.trim() || '(KOSONG)') === localFilters.activity)
  )
  const pages = Math.max(1, Math.ceil(matched.length / PAGE_SIZE))
  const currentPage = Math.min(page, pages)
  const visible = matched.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)
  function updateLocalFilter(key: keyof typeof localFilters, value: string) {
    setLocalFilters(current => ({ ...current, [key]: value }))
    setPage(1)
  }

  return <section id="pegawai" className="section-card directory-card employee-section">
    <div className="section-header employee-section-header"><div><h2>Daftar karyawan</h2><p>{matched.length.toLocaleString('id-ID')} karyawan sesuai filter dashboard dan pencarian</p></div><label className="search-box"><Search size={16}/><input value={query} onChange={event => { setQuery(event.target.value); setPage(1) }} placeholder="Cari NIP, nama, jabatan, atau divisi" aria-label="Cari karyawan"/></label></div>
    <div className="employee-filter-bar" aria-label="Filter daftar karyawan">
      <div className="employee-filter-field"><span>Status</span><FilterDropdown label="Status" options={statuses} selected={localFilters.status ? [localFilters.status] : []} onChange={values => updateLocalFilter('status', values[0] ?? '')}/></div>
      <div className="employee-filter-field"><span>Gender</span><FilterDropdown label="Gender" options={['L', 'P', 'UNKNOWN']} selected={localFilters.gender ? [localFilters.gender] : []} display={value => value === 'L' ? 'Laki-laki' : value === 'P' ? 'Perempuan' : 'Tidak diketahui'} onChange={values => updateLocalFilter('gender', values[0] ?? '')}/></div>
      <div className="employee-filter-field"><span>Divisi</span><FilterDropdown label="Divisi" options={divisions} selected={localFilters.division ? [localFilters.division] : []} onChange={values => updateLocalFilter('division', values[0] ?? '')}/></div>
      <div className="employee-filter-field"><span>Activity</span><FilterDropdown label="Activity" options={activities} selected={localFilters.activity ? [localFilters.activity] : []} onChange={values => updateLocalFilter('activity', values[0] ?? '')}/></div>
      <button type="button" className="employee-filter-reset" onClick={() => { setLocalFilters({ status: '', gender: '', division: '', activity: '' }); setPage(1) }} disabled={!Object.values(localFilters).some(Boolean)}><RotateCcw size={14}/> Reset</button>
    </div>
    <div className="table-scroll" role="region" aria-label="Tabel daftar karyawan, dapat digulir" tabIndex={0}><table className="employee-table"><thead><tr><th>NIP</th><th>Nama</th><th>Band</th><th>Jabatan</th><th>Direktorat</th><th>Divisi</th><th>Bagian</th><th>Status</th><th>Gender</th><th>Usia</th><th>Masa kerja</th><th>Pendidikan</th><th>Activity</th></tr></thead><tbody>{visible.map(record => <tr key={record.nip}><td className="nip-cell">{record.nip}</td><td>{record.name}</td><td>{record.band ?? '—'}</td><td>{record.position}</td><td>{record.directorate}</td><td>{record.division || '—'}</td><td>{record.section || '—'}</td><td>{record.status}</td><td>{genderOf(record) === 'L' ? 'L' : genderOf(record) === 'P' ? 'P' : '—'}</td><td>{fullYears(record.birthDate, asOf) ?? '—'}</td><td>{fullYears(record.joinDate, asOf) ?? '—'}</td><td>{educationOf(record)}</td><td>{record.activity || '—'}</td></tr>)}</tbody></table>{!visible.length && <div className="empty-table">Tidak ada karyawan yang sesuai.</div>}</div>
    <div className="pagination"><span>Menampilkan {matched.length ? (currentPage - 1) * PAGE_SIZE + 1 : 0}–{Math.min(currentPage * PAGE_SIZE, matched.length)} dari {matched.length}</span><div><button type="button" onClick={() => setPage(currentPage - 1)} disabled={currentPage === 1} aria-label="Halaman sebelumnya"><ChevronLeft size={16}/></button><span>{currentPage} / {pages}</span><button type="button" onClick={() => setPage(currentPage + 1)} disabled={currentPage === pages} aria-label="Halaman berikutnya"><ChevronRight size={16}/></button></div></div>
  </section>
}
