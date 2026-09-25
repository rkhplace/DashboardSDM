import { ageGroup, educationOf, fullYears, genderOf, tenureGroup } from '../src/analytics/workforce.ts'
import type { EmployeeRecord } from '../src/types/workforce.ts'

const FIELDS = ['status', 'activity', 'directorate', 'division', 'section', 'position', 'positionType', 'businessFunction', 'band', 'gender', 'education', 'religion', 'institution', 'major', 'age', 'ageGroup', 'tenure', 'tenureGroup'] as const
type Field = typeof FIELDS[number]
type Filter = { field: Field; operator: 'eq' | 'contains' | 'gte' | 'lte' | 'between'; value?: string; min?: number; max?: number }
export type QuerySpec = { operation: 'count' | 'average' | 'distribution'; field?: Field; groupBy?: Field[]; filters?: Filter[] }

const numericFields = new Set<Field>(['age', 'tenure', 'band'])
const normal = (value: unknown) => String(value ?? '').toLocaleLowerCase('id').replace(/[^a-z0-9]/g, '')

function valueOf(record: EmployeeRecord, field: Field, asOf: string): string | number | null {
  if (field === 'age') return fullYears(record.birthDate, asOf)
  if (field === 'ageGroup') return ageGroup(fullYears(record.birthDate, asOf))
  if (field === 'tenure') return fullYears(record.joinDate, asOf)
  if (field === 'tenureGroup') return tenureGroup(fullYears(record.joinDate, asOf))
  if (field === 'gender') return genderOf(record) === 'L' ? 'Laki-laki' : genderOf(record) === 'P' ? 'Perempuan' : 'Tidak diketahui'
  if (field === 'education') return educationOf(record)
  if (field === 'band') return record.band
  return record[field]
}

function validField(value: unknown): value is Field { return typeof value === 'string' && FIELDS.includes(value as Field) }

function validQuery(input: unknown): QuerySpec | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null
  const value = input as Record<string, unknown>
  if (!['count', 'average', 'distribution'].includes(String(value.operation))) return null
  if (value.field !== undefined && !validField(value.field)) return null
  if (value.operation === 'average' && (!validField(value.field) || !numericFields.has(value.field))) return null
  if (value.groupBy !== undefined && (!Array.isArray(value.groupBy) || value.groupBy.length > 2 || value.groupBy.some(field => !validField(field)))) return null
  if (value.filters !== undefined && (!Array.isArray(value.filters) || value.filters.length > 6)) return null
  for (const filter of (value.filters ?? []) as unknown[]) {
    if (!filter || typeof filter !== 'object' || Array.isArray(filter)) return null
    const item = filter as Record<string, unknown>
    if (!validField(item.field) || !['eq', 'contains', 'gte', 'lte', 'between'].includes(String(item.operator))) return null
    if (['gte', 'lte', 'between'].includes(String(item.operator)) && !numericFields.has(item.field)) return null
    if (['eq', 'contains'].includes(String(item.operator)) && (typeof item.value !== 'string' || item.value.length > 100)) return null
    if (item.operator === 'between' && (typeof item.min !== 'number' || typeof item.max !== 'number' || item.min > item.max)) return null
    if (['gte', 'lte'].includes(String(item.operator)) && typeof item.min !== 'number' && typeof item.max !== 'number') return null
  }
  return value as QuerySpec
}

function matches(record: EmployeeRecord, filter: Filter, asOf: string): boolean {
  const actual = valueOf(record, filter.field, asOf)
  if (actual == null) return filter.operator === 'eq' && normal(filter.value) === normal('Tidak tersedia')
  if (filter.operator === 'eq') return normal(actual) === normal(filter.value)
  if (filter.operator === 'contains') return normal(actual).includes(normal(filter.value))
  if (typeof actual !== 'number') return false
  if (filter.operator === 'between') return actual >= (filter.min ?? Infinity) && actual <= (filter.max ?? -Infinity)
  if (filter.operator === 'gte') return actual >= (filter.min ?? filter.max ?? Infinity)
  return actual <= (filter.max ?? filter.min ?? -Infinity)
}

export function queryWorkforce(input: unknown, records: EmployeeRecord[], asOf: string) {
  const query = validQuery(input)
  if (!query) return { error: 'Parameter query tidak valid. Gunakan field dan operator dari deklarasi alat.' }
  const matched = records.filter(record => (query.filters ?? []).every(filter => matches(record, filter, asOf)))
  const base = { operation: query.operation, population: records.length, matched: matched.length, shareOfPopulation: records.length ? matched.length / records.length : 0, filters: query.filters ?? [] }
  if (query.operation === 'count') return base
  if (query.operation === 'average') {
    const values = matched.map(record => valueOf(record, query.field!, asOf)).filter((value): value is number => typeof value === 'number')
    if (query.groupBy?.length) {
      const groups = new Map<string, { values: Record<string, string | number>; count: number; validCount: number; sum: number }>()
      for (const record of matched) {
        const labels = Object.fromEntries(query.groupBy.map(field => [field, valueOf(record, field, asOf) ?? 'Tidak tersedia'])) as Record<string, string | number>
        const key = JSON.stringify(labels)
        const item = groups.get(key) ?? { values: labels, count: 0, validCount: 0, sum: 0 }
        item.count++
        const value = valueOf(record, query.field!, asOf)
        if (typeof value === 'number') { item.validCount++; item.sum += value }
        groups.set(key, item)
      }
      return { ...base, field: query.field, groupBy: query.groupBy, totalGroups: groups.size, truncated: groups.size > 60,
        groups: [...groups.values()].map(item => ({ values: item.values, count: item.count, validCount: item.validCount, average: item.validCount ? item.sum / item.validCount : null }))
          .sort((a, b) => (b.average ?? -Infinity) - (a.average ?? -Infinity)).slice(0, 60) }
    }
    return { ...base, field: query.field, validCount: values.length, average: values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null }
  }
  const groups = new Map<string, { values: Record<string, string | number>; count: number }>()
  const groupBy = query.groupBy?.length ? query.groupBy : query.field ? [query.field] : []
  if (!groupBy.length) return { error: 'Untuk distribusi, sebutkan satu atau dua field pada groupBy.' }
  for (const record of matched) {
    const values = Object.fromEntries(groupBy.map(field => [field, valueOf(record, field, asOf) ?? 'Tidak tersedia'])) as Record<string, string | number>
    const key = JSON.stringify(values)
    const item = groups.get(key) ?? { values, count: 0 }
    item.count++
    groups.set(key, item)
  }
  return { ...base, groupBy, totalGroups: groups.size, truncated: groups.size > 60, groups: [...groups.values()].sort((a, b) => b.count - a.count).slice(0, 60).map(item => ({ ...item, shareOfMatched: matched.length ? item.count / matched.length : 0 })) }
}

export function workforceCatalog(records: EmployeeRecord[], asOf: string) {
  const categorical = FIELDS.filter(field => !numericFields.has(field))
  return {
    fields: FIELDS,
    numericFields: [...numericFields],
    categories: Object.fromEntries(categorical.map(field => [field, [...new Set(records.map(record => valueOf(record, field, asOf) ?? 'Tidak tersedia'))].slice(0, 80)])),
  }
}

export const workforceTool = {
  type: 'function',
  name: 'query_workforce',
  description: 'Hitung atau kelompokkan data karyawan pada file dan filter aktif. Pakai untuk angka, perbandingan, rata-rata termasuk rata-rata per kelompok, komposisi, dan irisan beberapa kategori. Tidak mengembalikan identitas individu.',
  parameters: {
    type: 'object',
    properties: {
      operation: { type: 'string', enum: ['count', 'average', 'distribution'] },
      field: { type: 'string', enum: FIELDS },
      groupBy: { type: 'array', items: { type: 'string', enum: FIELDS }, description: 'Satu atau dua field untuk distribusi atau rata-rata per kelompok, misalnya ["division","gender"].' },
      filters: { type: 'array', items: { type: 'object', properties: {
        field: { type: 'string', enum: FIELDS },
        operator: { type: 'string', enum: ['eq', 'contains', 'gte', 'lte', 'between'] },
        value: { type: 'string', description: 'Nilai untuk eq/contains. Gunakan kategori yang tertera pada profil data.' },
        min: { type: 'number', description: 'Batas bawah untuk gte/between.' },
        max: { type: 'number', description: 'Batas atas untuk lte/between.' },
      }, required: ['field', 'operator'] } },
    },
    required: ['operation'],
  },
} as const
