import type { Report, ReportTable } from './reportData'

type XlsxCell = { value?: string | number | null; type?: typeof String | typeof Number; fontWeight?: 'bold'; format?: string; backgroundColor?: string; color?: string; wrap?: boolean } | null
type XlsxRow = XlsxCell[]

const header = (value: string): XlsxCell => ({ value, fontWeight: 'bold', backgroundColor: '#173B68', color: '#FFFFFF' })

function cell(value: string | number | null, percent: boolean): XlsxCell {
  if (value === null || value === undefined || value === '') return null
  if (typeof value === 'number') return { value, type: Number, ...(percent ? { format: '0.0%' } : {}) }
  return { value, type: String }
}

function tableRows(table: ReportTable, withTitle = false): XlsxRow[] {
  const rows: XlsxRow[] = []
  if (withTitle) rows.push([{ value: table.title, fontWeight: 'bold' }])
  rows.push(table.headers.map(header))
  for (const row of table.rows) {
    const isTotal = row[0] === 'Total'
    rows.push(row.map((value, index) => {
      const next = cell(value, index === table.percentColumn)
      return next && isTotal ? { ...next, fontWeight: 'bold' } : next
    }))
  }
  if (table.note) rows.push([{ value: table.note, type: String }])
  return rows
}

function widths(rows: XlsxRow[]) {
  const count = Math.max(...rows.map(row => row.length))
  return Array.from({ length: count }, (_, index) => ({
    width: Math.min(45, Math.max(10, ...rows.slice(1).map(row => String(row[index]?.value ?? '').length + 2))),
  }))
}

function sheet(name: string, data: XlsxRow[], sticky = 1) {
  return { sheet: name.slice(0, 31), data, columns: widths(data), stickyRowsCount: sticky }
}

export async function exportExcel(report: Report, filename: string) {
  const { default: writeXlsxFile } = await import('write-excel-file/browser')
  const summary: XlsxRow[] = [
    [{ value: report.title, fontWeight: 'bold' }], [],
    ...report.meta.map(([key, value]): XlsxRow => [{ value: key, fontWeight: 'bold' }, { value, type: String }]), [],
    [header('Indikator'), header('Nilai')],
    ...report.kpis.map(([key, value]): XlsxRow => [{ value: key, type: String }, { value, type: String }]),
  ]
  const composition = report.compositions.flatMap((table, index) => [...(index ? [[] as XlsxRow] : []), ...tableRows(table, true)])
  const retirement: XlsxRow[] = [
    ...report.retirement.settings.map(([key, value]): XlsxRow => [{ value: key, fontWeight: 'bold' }, { value, type: String }]), [],
    ...tableRows(report.retirement.windows, true), [],
    ...tableRows(report.retirement.divisions, true),
  ]
  const sheets = [
    { ...sheet('Ringkasan', summary, 0), columns: [{ width: 34 }, { width: 70 }] },
    sheet('Komposisi', composition, 0),
    sheet('Matriks band', tableRows(report.bandMatrix)),
    sheet('Proyeksi pensiun', retirement, 0),
    sheet('Daftar pensiun', tableRows(report.retirement.candidates)),
    sheet('Daftar karyawan', tableRows(report.employees)),
  ]
  await writeXlsxFile(sheets as never, { fontFamily: 'Calibri', fontSize: 11 }).toFile(filename)
}
