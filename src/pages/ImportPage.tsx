import { useMemo, useState, type DragEvent } from 'react'
import { FileSpreadsheet, UploadCloud } from 'lucide-react'
import { useNavigate } from 'react-router'
import { createSession } from '../api/client'
import { BatchImportPanel } from '../components/BatchImportPanel'
import type { BatchItem, ReviewedItem } from '../data/batchReview'
import { DataQualityPanel } from '../components/DataQualityPanel'
import { SavedPeriods } from '../components/SavedPeriods'
import { inspectExcel, type ExcelInspection } from '../data/excelAdapter'
import { importNotes } from '../data/importChecks'
import { useWorkforceSession } from '../data/useWorkforceSession'
import { lastDayOfMonth, validateInspection } from '../data/validateImport'

const isExcel = (file: File) => /\.xlsx$/i.test(file.name)

export function ImportPage() {
  const navigate = useNavigate()
  const { activate, savePeriod, savePeriods, periods, history, storage, openPeriod, removePeriod } = useWorkforceSession()
  const [pending, setPending] = useState<{ inspection: ExcelInspection; filename: string } | null>(null)
  const [batch, setBatch] = useState<BatchItem[] | null>(null)
  const [reading, setReading] = useState(false)
  const [saving, setSaving] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const [period, setPeriod] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const asOf = lastDayOfMonth(period)
  const quality = useMemo(() => (pending && asOf ? validateInspection(pending.inspection, asOf) : null), [pending, asOf])
  const notes = useMemo(() => (pending && asOf ? importNotes(pending.inspection, period, history) : []), [pending, asOf, period, history])

  async function finish() {
    if (!pending || !asOf || !quality || quality.critical.length) return
    setLoading(true)
    setError('')
    try {
      const snapshot = { period, asOf, sourceFile: pending.filename, records: pending.inspection.records }
      const saved = await savePeriod(snapshot)
      const sessionId = await createSession(snapshot)
      activate(snapshot, sessionId)
      navigate('/dashboard', { state: saved ? undefined : { notSaved: true } })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Backend gagal membuat sesi.')
    } finally {
      setLoading(false)
    }
  }

  async function upload(list?: FileList | File[] | null) {
    const files = [...(list ?? [])]
    if (!files.length) return
    const excel = files.filter(isExcel)
    setError(excel.length < files.length ? `${files.length - excel.length} file dilewati karena bukan .xlsx.` : '')
    if (!excel.length) return
    setPending(null)
    setBatch(null)
    if (excel.length === 1) return readSingle(excel[0])
    // Several files: read them one by one so the list fills in as each finishes.
    const items: BatchItem[] = excel.map((file, index) => ({ id: `${index}-${file.name}`, filename: file.name, period: '' }))
    setBatch(items)
    setReading(true)
    for (const [index, file] of excel.entries()) {
      try {
        const inspection = await inspectExcel(file)
        setBatch(
          current =>
            current?.map(item => (item.id === items[index].id ? { ...item, inspection, period: inspection.period ?? '' } : item)) ?? null,
        )
      } catch (cause) {
        setBatch(
          current =>
            current?.map(item =>
              item.id === items[index].id ? { ...item, error: cause instanceof Error ? cause.message : 'File tidak dapat dibaca.' } : item,
            ) ?? null,
        )
      }
    }
    setReading(false)
  }

  async function readSingle(file: File) {
    setLoading(true)
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

  async function saveBatch(ready: ReviewedItem[]) {
    setError('')
    setSaving(`Menyimpan ${ready.length} periode...`)
    const snapshots = ready.map(item => ({
      period: item.period,
      asOf: item.asOf!,
      sourceFile: item.filename,
      records: item.inspection!.records,
    }))
    const { saved, failed } = await savePeriods(snapshots)
    const latest =
      snapshots.filter(item => saved.includes(item.period)).sort((a, b) => b.period.localeCompare(a.period))[0] ??
      snapshots.sort((a, b) => b.period.localeCompare(a.period))[0]
    try {
      setSaving('Membuka dashboard...')
      const sessionId = await createSession(latest)
      activate(latest, sessionId)
      navigate('/dashboard', { state: failed.length ? { notSaved: true } : undefined })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Dashboard gagal dibuka.')
      setSaving(null)
    }
  }

  async function open(target: string) {
    setLoading(true)
    setError('')
    try {
      await openPeriod(target)
      navigate('/dashboard')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Periode gagal dibuka.')
    } finally {
      setLoading(false)
    }
  }

  async function remove(target: string) {
    setError('')
    try {
      await removePeriod(target)
    } catch {
      setError('Periode gagal dihapus dari penyimpanan browser.')
    }
  }

  function drop(event: DragEvent<HTMLElement>) {
    event.preventDefault()
    setDragging(false)
    if (!loading) void upload(event.dataTransfer.files)
  }

  function reset() {
    setPending(null)
    setBatch(null)
    setPeriod('')
    setError('')
    setSaving(null)
  }

  return (
    <div className="landing-page">
      <div className={`landing-content ${pending || batch || periods.length ? 'landing-content-wide' : ''}`}>
        <div className="landing-brand">
          <img src="/logo-inti.png" alt="Logo PT INTI" />
          <span>PT INTI (Persero)</span>
        </div>
        <h1>Dashboard SDM</h1>
        <p className="landing-subtitle">
          {pending || batch ? 'Periksa hasil pembacaan file sebelum disimpan' : 'Upload data karyawan per periode untuk memulai'}
        </p>
        {batch ? (
          <BatchImportPanel
            items={batch}
            stored={history}
            reading={reading}
            saving={saving}
            onPeriodChange={(id, value) =>
              setBatch(current => current?.map(item => (item.id === id ? { ...item, period: value } : item)) ?? null)
            }
            onRemove={id =>
              setBatch(current => {
                const next = current?.filter(item => item.id !== id) ?? []
                return next.length ? next : null
              })
            }
            onSave={ready => {
              void saveBatch(ready)
            }}
            onReset={reset}
          />
        ) : pending ? (
          <DataQualityPanel
            inspection={pending.inspection}
            filename={pending.filename}
            period={period}
            onPeriodChange={setPeriod}
            quality={quality}
            loading={loading}
            notes={notes}
            onContinue={() => {
              void finish()
            }}
            onReset={reset}
          />
        ) : (
          <>
            <section
              className={`landing-upload ${dragging ? 'is-dragging' : ''}`}
              aria-label="Upload file data karyawan"
              onDragOver={event => {
                event.preventDefault()
                setDragging(true)
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={drop}
            >
              <div className="landing-upload-icon">
                <FileSpreadsheet size={28} strokeWidth={1.7} />
              </div>
              <h2>Upload File Data Karyawan</h2>
              <p>
                Format <strong>.xlsx</strong> · satu file untuk satu periode (bulan). Pilih atau seret{' '}
                <strong>beberapa file sekaligus</strong> untuk banyak periode.
              </p>
              <label className={`landing-file-button ${loading ? 'is-loading' : ''}`}>
                <UploadCloud size={17} />
                {loading ? 'Membaca file...' : 'Pilih File'}
                <input
                  type="file"
                  accept=".xlsx"
                  multiple
                  disabled={loading}
                  onChange={event => {
                    void upload(event.target.files)
                    event.target.value = ''
                  }}
                />
              </label>
            </section>
            <SavedPeriods
              periods={periods}
              storage={storage}
              busy={loading}
              onOpen={target => {
                void open(target)
              }}
              onRemove={target => {
                void remove(target)
              }}
            />
          </>
        )}
        {error && (
          <p className="landing-error" role="alert">
            {error}
          </p>
        )}
        <p className="landing-footnote">
          {storage === 'unavailable'
            ? 'Browser ini tidak mengizinkan penyimpanan lokal; data hanya dipakai selama halaman terbuka.'
            : 'File dibaca di browser. Setiap periode disimpan di browser perangkat ini, bukan di database server, agar bisa dibandingkan antar-periode.'}
        </p>
      </div>
    </div>
  )
}
