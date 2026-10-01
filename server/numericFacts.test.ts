import { describe, expect, it } from 'vitest'
import type { EmployeeRecord } from '../src/types/workforce.ts'
import { numericFacts, parseNumericCondition } from './numericFacts.ts'

const person = (birthDate: string | null, genderCode: number, joinDate: string | null = '2010-01-01') => ({ birthDate, genderCode, joinDate }) as EmployeeRecord

describe('numeric age/tenure thresholds in chat questions', () => {
  it('parses common Indonesian phrasings', () => {
    expect(parseNumericCondition('Ada berapa karyawan yang berumur diatas 56 tahun')).toEqual({ metric: 'age', op: 'gt', min: 56 })
    expect(parseNumericCondition('jumlah pegawai usia 50 tahun ke atas')).toEqual({ metric: 'age', op: 'gte', min: 50 })
    expect(parseNumericCondition('berapa yang usianya minimal 40')).toEqual({ metric: 'age', op: 'gte', min: 40 })
    expect(parseNumericCondition('karyawan dengan masa kerja lebih dari 20 tahun')).toEqual({ metric: 'tenure', op: 'gt', min: 20 })
    expect(parseNumericCondition('usia antara 30 dan 40 tahun')).toEqual({ metric: 'age', op: 'between', min: 30, max: 40 })
    expect(parseNumericCondition('berapa karyawan lulusan S1')).toBeNull()
  })

  it('counts strictly above the threshold and reports the inclusive comparison', () => {
    const records = [person('1968-01-01', 1), person('1970-07-31', 2), person('1970-08-01', 1), person('1990-01-01', 2), person(null, 1)]
    const facts = numericFacts('berapa karyawan berumur di atas 56 tahun', records, '2026-07-31')
    expect(facts[0]).toBe('Usia di atas 56 tahun (57 tahun ke atas): 1 dari 5 karyawan pada hasil filter (laki-laki 1, perempuan 0).')
    expect(facts[1]).toContain('56 tahun ke atas): 2 karyawan')
    expect(facts[2]).toBe('1 karyawan tanpa tanggal lahir valid tidak ikut dihitung.')
  })

  it('stays silent when the question has no numeric threshold', () => {
    expect(numericFacts('siapa saja di divisi operasional', [person('1980-01-01', 1)], '2026-07-31')).toEqual([])
  })
})
