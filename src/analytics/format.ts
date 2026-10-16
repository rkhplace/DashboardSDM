/** Display date for ISO yyyy-mm-dd values, e.g. "24 Sep 2026". Unreadable values pass through unchanged. */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const date = new Date(`${iso}T00:00:00Z`)
  return Number.isNaN(date.valueOf()) ? iso : date.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
}
