import { expect, it } from 'vitest'
import { getPrototypeSnapshot } from './repository'
import { inconsistentLabels, qualityCsv } from './validateImport'

it('finds labels that differ only by case or spacing and exports findings as CSV', () => {
  const [a, b] = getPrototypeSnapshot().records
  const records = [{ ...a, nip: 'X1', position: 'Teknisi' }, { ...b, nip: 'X2', position: 'TEKNISI ' }]
  const findings = inconsistentLabels(records).filter(item => item.field === 'Jabatan')
  expect(findings).toEqual([{ field: 'Jabatan', variants: ['Teknisi', 'TEKNISI '], nips: ['X1', 'X2'] }])
  const csv = qualityCsv({ critical: [], warnings: [{ label: 'Tes', count: 1, nips: ['X1'], hint: 'cek' }] }, records)
  expect(csv.split('\r\n')[1]).toBe(`"Peringatan","Tes","X1","${records[0].name}","cek"`)
})

it('flags PKWT contract end dates that are missing, unreadable, or already past', async () => {
  const { validateInspection } = await import('./validateImport')
  const [a, b, c, d] = getPrototypeSnapshot().records
  const records = [
    { ...a, nip: 'C1', status: 'PKWT', contractEnd: null },
    { ...b, nip: 'C2', status: 'PKWT Proyek', contractEnd: '2026-06-30' },
    { ...c, nip: 'C3', status: 'PKWT', contractEnd: null },
    { ...d, nip: 'C4', status: 'PKWT', contractEnd: '2027-01-31' },
    { ...d, nip: 'C5', status: 'Aktif', contractEnd: '2026-05-31' },
  ]
  const inspection = { sheetName: 'Juli 2026', period: '2026-07', headers: [], rowCount: 5, missingColumns: [], missingOptionalColumns: [], errorCells: [], contractEndColumn: 'TANGGAL SELESAI KONTRAK', invalidContractEnd: ['C3'], preview: [], records }
  const warnings = validateInspection(inspection, '2026-07-31').warnings
  const find = (label: string) => warnings.find(item => item.label === label)?.nips
  expect(find('PKWT tanpa tanggal selesai kontrak')).toEqual(['C1'])
  expect(find('Tanggal selesai kontrak tidak terbaca')).toEqual(['C3'])
  expect(find('Kontrak PKWT sudah berakhir per periode ini')).toEqual(['C2'])
  expect(find('Tanggal selesai kontrak terisi pada karyawan non-PKWT')).toEqual(['C5'])
})
