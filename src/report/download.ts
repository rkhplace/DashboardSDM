export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

export function downloadCsv(csv: string, filename: string) {
  downloadBlob(new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' }), filename)
}
