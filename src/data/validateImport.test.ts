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
