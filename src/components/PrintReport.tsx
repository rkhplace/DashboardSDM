import type { Cell, Report, ReportTable } from '../report/reportData'

const show = (value: Cell, percent: boolean) => value === null || value === '' ? '—' : typeof value === 'number' ? (percent ? `${(value * 100).toFixed(1)}%` : value.toLocaleString('id-ID')) : value

function Table({ table, bars = false, limit }: { table: ReportTable; bars?: boolean; limit?: number }) {
  const rows = limit ? table.rows.slice(0, limit) : table.rows
  return <div className="print-block">
    <h3>{table.title}</h3>
    <table className="print-table"><thead><tr>{table.headers.map(head => <th key={head}>{head}</th>)}</tr></thead><tbody>
      {rows.map((row, index) => <tr key={index} className={row[0] === 'Total' ? 'print-total' : ''}>{row.map((value, column) => <td key={column}>
        {bars && column === table.percentColumn && row[0] !== 'Total' && typeof value === 'number'
          ? <span className="print-bar"><span className="print-bar-track"><i style={{ width: `${value * 100}%` }}/></span><em>{show(value, true)}</em></span>
          : show(value, column === table.percentColumn)}
      </td>)}</tr>)}
    </tbody></table>
    {limit && table.rows.length > limit && <p className="print-note">Menampilkan {limit} dari {table.rows.length} baris. Daftar lengkap ada di ekspor Excel.</p>}
    {table.note && <p className="print-note">{table.note}</p>}
  </div>
}

/** Hidden on screen; the only thing printed when the user saves the dashboard report as PDF. */
export function PrintReport({ report }: { report: Report }) {
  const byKey = (key: string) => report.compositions.find(table => table.key === key)!
  return <article className="print-report" aria-hidden="true">
    <header className="print-header"><img src="/logo-inti.png" alt=""/><div><h1>{report.title}</h1><p>Dashboard SDM · dokumen internal</p></div></header>
    <dl className="print-meta">{report.meta.map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{value}</dd></div>)}</dl>
    <h2>Ringkasan</h2>
    <div className="print-kpis">{report.kpis.map(([key, value]) => <div key={key}><span>{key}</span><strong>{value}</strong></div>)}</div>
    <h2>Komposisi karyawan</h2>
    <div className="print-grid">
      <Table table={byKey('status')} bars/>
      <Table table={byKey('gender')} bars/>
      <Table table={byKey('usia')} bars/>
      <Table table={byKey('masa-kerja')} bars/>
      <Table table={byKey('pendidikan')} bars/>
      <Table table={byKey('direktorat')} bars/>
    </div>
    <Table table={byKey('divisi')} bars limit={20}/>
    <h2 className="print-page-break">Proyeksi pensiun &amp; risiko suksesi</h2>
    <dl className="print-meta">{report.retirement.settings.map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{value}</dd></div>)}</dl>
    <div className="print-grid print-grid-retirement">
      <Table table={report.retirement.windows}/>
    </div>
    <Table table={report.retirement.divisions} bars/>
    <Table table={report.retirement.candidates} limit={40}/>
    <p className="print-note">Asumsi pensiun pada tanggal mencapai usia pensiun; posisi kunci = jabatan struktural. Angka mengikuti file dan filter aktif saat laporan dibuat.</p>
  </article>
}
