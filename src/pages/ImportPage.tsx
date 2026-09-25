import { useState } from 'react'
import { FileSpreadsheet, UploadCloud } from 'lucide-react'
import { useNavigate } from 'react-router'
import { createSession } from '../api/client'
import { inspectExcel, type ExcelInspection } from '../data/excelAdapter'
import { useWorkforceSession } from '../data/useWorkforceSession'
import { lastDayOfMonth, validateInspection } from '../data/validateImport'

export function ImportPage() {
  const navigate = useNavigate()
  const { activate } = useWorkforceSession()
  const [pending, setPending] = useState<{ inspection: ExcelInspection; filename: string } | null>(null)
  const [period, setPeriod] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function finish(inspection: ExcelInspection, filename: string, selectedPeriod: string) {
    const asOf = lastDayOfMonth(selectedPeriod)
    if (!asOf) {
      setError('Pilih bulan dan tahun periode data yang valid.')
      return
    }
    const quality = validateInspection(inspection, asOf)
    if (quality.critical.length > 0) {
      setError(`File perlu diperbaiki: ${quality.critical.map(issue => `${issue.label} (${issue.count})`).join(', ')}.`)
      return
    }
    setLoading(true)
    try {
      const snapshot = { period: selectedPeriod, asOf, sourceFile: filename, records: inspection.records }
      const sessionId = await createSession(snapshot)
      activate(snapshot, sessionId)
      navigate('/dashboard')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Backend gagal membuat sesi.')
    } finally {
      setLoading(false)
    }
  }

  async function upload(file?: File) {
    if (!file) return
    setLoading(true)
    setError('')
    setPending(null)
    try {
      const inspection = await inspectExcel(file)
      if (inspection.period) await finish(inspection, file.name, inspection.period)
      else setPending({ inspection, filename: file.name })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'File tidak dapat dibaca.')
    } finally {
      setLoading(false)
    }
  }

  return <div className="landing-page">
    <div className="landing-content">
      <div className="landing-brand"><img src="/logo-inti.png" alt="Logo PT INTI" /><span>PT INTI (Persero)</span></div>
      <h1>Dashboard SDM</h1>
      <p className="landing-subtitle">Upload data karyawan untuk memulai</p>
      <section className="landing-upload" aria-label="Upload file data karyawan">
        <div className="landing-upload-icon"><FileSpreadsheet size={28} strokeWidth={1.7}/></div>
        <h2>Upload File Data Karyawan</h2>
        <p>Format yang didukung: <strong>.xlsx</strong></p>
        <label className={`landing-file-button ${loading ? 'is-loading' : ''}`}>
          <UploadCloud size={17}/>{loading ? 'Membaca file...' : 'Pilih File'}
          <input type="file" accept=".xlsx" disabled={loading} onChange={event => { void upload(event.target.files?.[0]); event.target.value = '' }} />
        </label>
        {pending && <div className="landing-period"><p>Periode tidak ditemukan pada nama sheet atau file. Pilih bulan data untuk melanjutkan.</p><div><input aria-label="Periode data" type="month" value={period} onChange={event => setPeriod(event.target.value)} /><button type="button" disabled={!period || loading} onClick={() => { void finish(pending.inspection, pending.filename, period) }}>Lanjut ke dashboard</button></div></div>}
        {error && <p className="landing-error" role="alert">{error}</p>}
      </section>
      <p className="landing-footnote">File dibaca di browser; data sesi dipakai chatbot saat bertanya dan hilang saat halaman ditutup.</p>
    </div>
  </div>
}
