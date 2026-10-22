/** Number with Indonesian digit grouping, e.g. 1.234. */
export const formatNumber = (value: number, options?: Intl.NumberFormatOptions) => value.toLocaleString('id-ID', options)

/** A 0–1 share as a percentage with one decimal, e.g. "12,5%"; "—" when unknown. */
export const formatPercent = (value: number | null) =>
  value == null ? '—' : `${(value * 100).toLocaleString('id-ID', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`

/** Display date for ISO yyyy-mm-dd values, e.g. "24 Sep 2026". Unreadable values pass through unchanged. */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const date = new Date(`${iso}T00:00:00Z`)
  return Number.isNaN(date.valueOf())
    ? iso
    : date.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
}
