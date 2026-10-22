import { describe, expect, it } from 'vitest'
import writeXlsxFile from 'write-excel-file/node'
import { inspectExcel } from './excelAdapter'
import { validateInspection } from './validateImport'

type Cell = { value: string | number | null; type?: typeof String | typeof Number } | null

async function workbook(sheets: { name: string; rows: (string | number | null)[][] }[]): Promise<File> {
  const data = sheets.map(sheet => ({
    sheet: sheet.name,
    data: sheet.rows.map(row =>
      row.map<Cell>(value => (value === null ? null : { value, type: typeof value === 'number' ? Number : String })),
    ),
  }))
  const buffer = await (writeXlsxFile(data as never) as unknown as { toBuffer(): Promise<Buffer> }).toBuffer()
  return new File([new Uint8Array(buffer)], 'DATA KARYAWAN AGUSTUS 2026.xlsx')
}

const header = [
  'Nip',
  'nama',
  'Jabatan',
  'Direktorat',
  'Divisi',
  'Status',
  'Jenis  Kelamin',
  'tanggal lahir',
  'Tanggal Masuk',
  'Band',
  'Pendidikan',
]
const row = (nip: string, band: string | number) => [nip, 'Ani', 'STAF', 'DIR', 'DIV', 'Aktif', 2, '01.02.1990', '03.04.2015', band, 87]

describe('Excel adapter robustness', () => {
  it('matches headers regardless of case and spacing, skips a cover sheet, and flags non-numeric numbers', async () => {
    const file = await workbook([
      { name: 'Keterangan', rows: [['Data karyawan Agustus 2026'], ['Sumber: HC']] },
      { name: 'Data Agu26', rows: [header, row('A1', 4), row('A2', '4A')] },
    ])
    const result = await inspectExcel(file)
    expect(result.sheetName).toBe('Data Agu26')
    expect(result.missingColumns).toEqual([])
    expect(result.records.map(record => [record.nip, record.band, record.genderCode, record.birthDate])).toEqual([
      ['A1', 4, 2, '1990-02-01'],
      ['A2', null, 2, '1990-02-01'],
    ])
    expect(result.invalidNumbers).toEqual([{ column: 'BAND', count: 1, nips: ['A2'] }])
    const warnings = validateInspection(result, '2026-08-31').warnings
    expect(warnings.find(item => item.label === 'Kolom BAND berisi nilai bukan angka')?.nips).toEqual(['A2'])
  })
})
