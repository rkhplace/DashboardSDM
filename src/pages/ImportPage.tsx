import { useMemo, useState } from 'react'
import { FileSpreadsheet, UploadCloud } from 'lucide-react'
import { useNavigate } from 'react-router'
import { createSession } from '../api/client'
import { DataQualityPanel } from '../components/DataQualityPanel'
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
  const asOf = lastDayOfMonth(period)
  const quality = useMemo(() => pending && asOf ? validateInspection(pending.inspection, asOf) : null, [pending, asOf])

  async function finish() {
    if (!pending || !asOf || !quality || quality.critical.length) return
    setLoading(true)
    setError('')
    try {
      const snapshot = { period, asOf, sourceFile: pending.filename, records: pending.inspection.records }
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
      setPeriod(inspection.period ?? '')
      setPending({ inspection, filename: file.name })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'File tidak dapat dibaca.')
    } finally {
      setLoading(false)
    }
  }

  function reset() { setPending(null); setPeriod(''); setError('') }

  return <div className="landing-page">
    <div className={`landing-content ${pending ? 'landing-content-wide' : ''}`}>
      <div className="landing-brand"><img src="/logo-inti.png" alt="Logo PT INTI" /><span>PT INTI (Persero)</span></div>
      <h1>Dashboard SDM</h1>
      <p className="landing-subtitle">{pending ? 'Periksa hasil pembacaan file sebelum masuk dashboard' : 'Upload data karyawan untuk memulai'}</p>
      {pending
        ? <DataQualityPanel inspection={pending.inspection} filename={pending.filename} period={period} onPeriodChange={setPeriod} quality={quality} loading={loading} onContinue={() => { void finish() }} onReset={reset}/>
        : <section className="landing-upload" aria-label="Upload file data karyawan">
          <div className="landing-upload-icon"><FileSpreadsheet size={28} strokeWidth={1.7}/></div>
          <h2>Upload File Data Karyawan</h2>
          <p>Format yang didukung: <strong>.xlsx</strong></p>
          <label className={`landing-file-button ${loading ? 'is-loading' : ''}`}>
            <UploadCloud size={17}/>{loading ? 'Membaca file...' : 'Pilih File'}
            <input type="file" accept=".xlsx" disabled={loading} onChange={event => { void upload(event.target.files?.[0]); event.target.value = '' }} />
          </label>
        </section>}
      {error && <p className="landing-error" role="alert">{error}</p>}
      <p className="landing-footnote">File dibaca di browser; data sesi dipakai chatbot saat bertanya dan hilang saat halaman ditutup.</p>
    </div>
  </div>
}
