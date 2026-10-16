import { expect, it } from 'vitest'
import { formatDate } from './format'

it('formats ISO dates the Indonesian way', () => {
  expect(formatDate('2026-09-24')).toBe('24 Sep 2026')
  expect(formatDate('2026-08-05')).toBe('5 Agu 2026')
  expect(formatDate(null)).toBe('—')
})
