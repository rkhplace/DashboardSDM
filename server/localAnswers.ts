import { AGE_GROUPS, ageGroup, educationOf, fullYears, genderOf } from '../src/analytics/workforce.ts'
import type { EmployeeRecord } from '../src/types/workforce.ts'

export interface LocalAnswer {
  answer: string
  evidence: { metric: string; value: number }[]
  personal: boolean
}

const answer = (text: string, metric?: string, value?: number, personal = false): LocalAnswer => ({
  answer: text,
  evidence: metric === undefined || value === undefined ? [] : [{ metric, value }],
  personal,
})

function mentionedLabel(message: string, labels: string[]): string | undefined {
  return [...labels].sort((a, b) => b.length - a.length).find(label => {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    return new RegExp(`(?:^|[^a-z0-9])${escaped}(?=$|[^a-z0-9])`, 'i').test(message)
  })
}

function mentionedActivity(message: string, labels: string[]): string | undefined {
  const normalizedMessage = message.toLocaleLowerCase('id').replace(/[^a-z0-9]/g, '')
  return [...labels].sort((a, b) => b.length - a.length).find(label => {
    const normalizedLabel = label.toLocaleLowerCase('id').replace(/[^a-z0-9]/g, '')
    return normalizedLabel && normalizedMessage.includes(normalizedLabel)
  })
}

function mentionedAgeGroup(message: string): string | undefined {
  const normalizedMessage = message.toLocaleLowerCase('id').replace(/[‐‑‒–—−]/g, '-').replace(/\s/g, '')
  return AGE_GROUPS.find(label => {
    if (label === 'Tidak diketahui' && !/\b(usia|umur)\b/i.test(message)) return false
    const normalizedLabel = label.toLocaleLowerCase('id').replace(/[‐‑‒–—−]/g, '-').replace(/\s/g, '')
    return normalizedMessage.includes(normalizedLabel)
  })
}

function categoriesIn(message: string, records: EmployeeRecord[]) {
  return {
    status: mentionedLabel(message, [...new Set(records.map(record => record.status))]),
    division: mentionedLabel(message, [...new Set(records.map(record => record.division).filter(Boolean))]),
    activity: mentionedActivity(message, [...new Set(records.map(record => record.activity?.trim()).filter((value): value is string => Boolean(value)))]),
    ageGroupLabel: mentionedAgeGroup(message),
    education: mentionedLabel(message, ['SLTP', 'SLTA', 'D3', 'D4', 'S1', 'S2', 'S3']),
    gender: /\blaki-laki\b/i.test(message) ? 'L' : /\bperempuan\b/i.test(message) ? 'P' : undefined,
  }
}

function hasCategory(selection: ReturnType<typeof categoriesIn>): boolean {
  return Object.values(selection).some(Boolean)
}

function employeeDetails(record: EmployeeRecord, message: string, asOf: string): string {
  const parts: string[] = []
  if (/\b(nip|identitas)\b/i.test(message)) parts.push(`NIP ${record.nip}`)
  if (/\b(status|aktif)\b/i.test(message)) parts.push(`status ${record.status}`)
  if (/\b(divisi|unit)\b/i.test(message)) parts.push(`divisi ${record.division}`)
  if (/\b(jabatan|posisi)\b/i.test(message)) parts.push(`jabatan ${record.position}`)
  if (/\b(usia|umur)\b/i.test(message)) {
    const years = fullYears(record.birthDate, asOf)
    parts.push(years === null ? 'usia tidak tersedia' : `usia ${years} tahun`)
  }
  if (/\b(pendidikan|lulusan)\b/i.test(message)) parts.push(`pendidikan ${educationOf(record)}`)
  if (!parts.length) parts.push(`jabatan ${record.position}`, `divisi ${record.division}`, `status ${record.status}`)
  return `${record.name}: ${parts.join(', ')}.`
}

export function answerFromSession(message: string, records: EmployeeRecord[], asOf: string, previousQuestions: string[] = []): LocalAnswer | null {
  const text = message.toLocaleLowerCase('id')
  const asksWho = /\b(siapa|sebutkan|daftar|nama)\b/.test(text)
  const asksCount = /\b(berapa|jumlah|total)\b/.test(text)
  const asksPercent = /\b(persen|persentase|proporsi)\b/.test(text)
  const asksAverage = /\b(rata[\s-]*rata|rerata|average|mean)\b/.test(text)
  const asksAboutData = asksWho || asksCount || asksPercent || /\b(menurut data|dalam data|pada data)\b/.test(text)

  if (asksAboutData && /\b(sangat baik|baik sekali|kinerja|performa|prestasi|rating|penilaian|skor)\b/.test(text)) {
    return answer('Data ini tidak memuat penilaian keaktifan atau kinerja seperti “sangat baik”. Kolom status berisi kategori kepegawaian, misalnya Aktif dan PKWT. Jika maksud Anda status Aktif, tanyakan “Siapa karyawan berstatus Aktif?”')
  }

  const mentionedEmployee = records.find(record => text.includes(record.name.toLocaleLowerCase('id')) || text.includes(record.nip.toLocaleLowerCase('id')))
  if (mentionedEmployee) return answer(employeeDetails(mentionedEmployee, message, asOf), 'matchedEmployees', 1, true)

  let selection = categoriesIn(message, records)
  if (!hasCategory(selection) && (asksWho || asksAverage || /\b(kalau|bagaimana|mereka|itu)\b/.test(text))) {
    const prior = [...previousQuestions].reverse().find(question => hasCategory(categoriesIn(question, records)))
    if (prior) selection = categoriesIn(prior, records)
  }
  const { status, division, activity, ageGroupLabel, education, gender } = selection
  const selected = hasCategory(selection)
  if (/\b(per|tiap|setiap|masing-masing)\s+(divisi|unit|status|pendidikan)\b/.test(text) && !asksWho) return null
  const matched = selected ? records.filter(record =>
    (!status || record.status === status)
    && (!division || record.division === division)
    && (!education || educationOf(record) === education)
    && (!gender || genderOf(record) === gender)
    && (!activity || record.activity?.trim() === activity)
    && (!ageGroupLabel || ageGroup(fullYears(record.birthDate, asOf)) === ageGroupLabel)) : records
  const labels = [status && `berstatus ${status}`, division && `di ${division}`, education && `lulusan ${education}`, gender && (gender === 'L' ? 'laki-laki' : 'perempuan'), activity && `dengan aktivitas ${activity}`, ageGroupLabel && `dengan rentang usia ${ageGroupLabel}`].filter(Boolean).join(' ')
  const ageBreakdown = ageGroupLabel && !gender && matched.length
    ? ` Rinciannya: ${matched.filter(record => genderOf(record) === 'L').length} laki-laki, ${matched.filter(record => genderOf(record) === 'P').length} perempuan${matched.some(record => genderOf(record) === 'UNKNOWN') ? `, ${matched.filter(record => genderOf(record) === 'UNKNOWN').length} jenis kelamin tidak diketahui` : ''}.`
    : ''

  if (asksAverage) {
    const ageMetric = /\b(usia|umur)\b/.test(text)
    const tenureMetric = /\b(masa kerja|lama bekerja)\b/.test(text)
    if (!ageMetric && !tenureMetric) return answer('Rata-rata apa yang ingin diketahui: usia atau masa kerja?')
    const values = matched.map(record => fullYears(ageMetric ? record.birthDate : record.joinDate, asOf)).filter((value): value is number => value !== null)
    if (!values.length) return answer(`Tanggal ${ageMetric ? 'lahir' : 'masuk'} untuk ${selected ? `karyawan ${labels}` : 'karyawan pada hasil filter'} tidak tersedia.`)
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length
    const formatted = mean.toLocaleString('id-ID', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
    return answer(`Rata-rata ${ageMetric ? 'usia' : 'masa kerja'} ${selected ? `karyawan ${labels}` : 'karyawan pada hasil filter'} adalah ${formatted} tahun, dihitung dari ${values.length} karyawan dengan tanggal ${ageMetric ? 'lahir' : 'masuk'} valid.`, ageMetric ? 'averageAge' : 'averageTenure', mean)
  }

  if (asksWho) {
    if (!selected) return answer('Sebutkan status atau divisi yang ingin dicari, misalnya “Siapa karyawan berstatus Aktif?”')
    if (!matched.length) return answer(`Tidak ada karyawan ${labels} pada hasil filter.`, 'matchedEmployees', 0)
    const names = matched.slice(0, 10).map(record => record.name).join(', ')
    const remainder = matched.length > 10 ? ` Saya tampilkan 10 nama pertama; ${matched.length - 10} lainnya dapat dilihat lewat filter daftar karyawan.` : ''
    return answer(`Ada ${matched.length} karyawan ${labels}: ${names}.${remainder}`, 'matchedEmployees', matched.length, true)
  }

  if (asksCount || asksPercent || activity && (!/\b(apa|arti|maksud|jelaskan)\b/.test(text) || /\b(kalau|bagaimana|yang)\b/.test(text))) {
    if (!selected && /\b(usia|umur|masa kerja|band|jabatan|dengan|yang)\b/.test(text)) return null
    if (!selected && !/\b(karyawan|pegawai|personel|orang|semua|seluruh)\b/.test(text)) return null
    if (/\b(usia|umur|masa kerja|lama bekerja)\b/.test(text) && !ageGroupLabel) return answer('Untuk data usia atau masa kerja, tanyakan rata-ratanya atau sebutkan rentang yang ingin dihitung.')
    const subject = selected ? `karyawan ${labels}` : 'karyawan pada hasil filter'
    if (asksPercent) {
      const share = records.length ? matched.length / records.length * 100 : 0
      const scope = selected ? ` termasuk ${subject}` : ''
      return answer(`${matched.length} dari ${records.length} karyawan pada hasil filter${scope} (${share.toLocaleString('id-ID', { maximumFractionDigits: 1 })}%).${ageBreakdown}`, 'matchedEmployees', matched.length)
    }
    return answer(`Ada ${matched.length} ${subject}.${ageBreakdown}`, 'matchedEmployees', matched.length)
  }

  return null
}

export function keepQuestionLocal(message: string, records: EmployeeRecord[]): boolean {
  const text = message.toLocaleLowerCase('id')
  return /\b(nip|identitas|email|individu)\b/.test(text)
    || /\b(nama|siapa)\s+(saja|mereka|karyawan|pegawai|personel|orang|staf|anggota)\b/.test(text)
    || /\b(daftar|sebutkan)\s+nama\b/.test(text)
    || /\b\d{6,}\b/.test(text)
    || /[\w.+-]+@[\w.-]+\.[a-z]{2,}/i.test(text)
    || records.some(record => text.includes(record.name.toLocaleLowerCase('id')) || text.includes(record.nip.toLocaleLowerCase('id')))
}
