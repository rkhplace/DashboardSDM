import { describe, expect, it } from 'vitest'
import { getPrototypeSnapshot } from '../src/data/repository'
import { IdentityMap, listEmployees } from './identity'

describe('identity masking for the chatbot', () => {
  const snapshot = getPrototypeSnapshot()
  const [first, second] = snapshot.records

  it('swaps names and NIPs for stable codes and restores them in answers', () => {
    const identities = new IdentityMap()
    const masked = identities.redact(`Bandingkan ${first.name} dengan NIP ${second.nip}, lalu ${first.name.toLocaleLowerCase('id')} lagi.`, snapshot.records)
    expect(masked).toBe('Bandingkan KARYAWAN_1 dengan NIP KARYAWAN_2, lalu KARYAWAN_1 lagi.')
    expect(identities.restore('KARYAWAN_2 (NIP_KARYAWAN_2) dan KARYAWAN_9')).toBe(`${second.name} (${second.nip}) dan KARYAWAN_9`)
  })

  it('lists people by filter or code without exposing names or NIPs', () => {
    const identities = new IdentityMap()
    const byFilter = listEmployees({ filters: [{ field: 'division', operator: 'eq', value: first.division }] }, snapshot.records, snapshot.asOf, identities) as { matched: number; rows: { ref: string }[] }
    expect(byFilter.matched).toBe(snapshot.records.filter(record => record.division === first.division).length)
    expect(JSON.stringify(byFilter)).not.toContain(first.name)
    expect(JSON.stringify(byFilter)).not.toContain(first.nip)
    const byRef = listEmployees({ refs: [byFilter.rows[0].ref] }, snapshot.records, snapshot.asOf, identities) as { matched: number }
    expect(byRef.matched).toBe(1)
    expect(listEmployees({ filters: [{ field: 'name', operator: 'eq', value: 'x' }] }, snapshot.records, snapshot.asOf, identities)).toHaveProperty('error')
  })
})
