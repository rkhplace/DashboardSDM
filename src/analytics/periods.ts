/** Helpers for YYYY-MM periods, the unit every upload and comparison is keyed on. */

/** Short Indonesian month label for a YYYY-MM period, e.g. "Des 2026". */
export const monthLabel = (period: string) =>
  new Date(`${period}-01T00:00:00Z`).toLocaleDateString('id-ID', { month: 'short', year: 'numeric', timeZone: 'UTC' })

/** The YYYY-MM period `offset` months after (or before, when negative) `period`. */
export function shiftMonth(period: string, offset: number): string {
  const [year, month] = period.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1 + offset, 1)).toISOString().slice(0, 7)
}

/** Calendar months from one YYYY-MM period to another. */
export function monthsBetween(from: string, to: string): number {
  const [fromYear, fromMonth] = from.split('-').map(Number)
  const [toYear, toMonth] = to.split('-').map(Number)
  return (toYear - fromYear) * 12 + (toMonth - fromMonth)
}
