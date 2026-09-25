# Bedah backend dan integrasi AI

Status: prototipe lokal telah diimplementasikan. Keputusan pengguna: data hanya berlaku per sesi, layanan AI memakai Google Gemini API key pada free tier, dan fitur AI mencakup chatbot.

## Kondisi aplikasi saat ini

Alur aktif adalah `ImportPage` → `inspectExcel` → `validateInspection` → `POST /sessions` → state `WorkforceSessionProvider` → `DashboardPage`. Excel dibaca di browser, lalu snapshot dikirim sebagai JSON ke backend lokal dan ditahan dalam memori selama maksimal satu jam. Setelah refresh, state browser hilang sehingga pengguna perlu upload ulang. `src/data/repository.ts` hanya mengakses fixture dummy untuk test, bukan database. Belum ada autentikasi atau audit. Chatbot memanggil Gemini bila `GEMINI_API_KEY` tersedia.

Aturan hitung yang sudah ada di `src/analytics/workforce.ts` perlu menjadi kontrak bersama: headcount memakai NIP unik; status aktif berarti label persis `Aktif`; usia dan masa kerja dihitung terhadap tanggal akhir periode; gender dan pendidikan tidak dikenal tetap punya kategori sendiri. Snapshot lintas periode, tren, retensi, dan prediksi belum bisa dihitung dari satu workbook.

## Batas tanggung jawab

1. **Browser:** memilih file, memberi umpan balik validasi awal, menampilkan dashboard, mengirim permintaan berdasarkan filter. Kunci layanan AI tidak pernah disimpan di Vite atau browser.
2. **Backend:** memvalidasi ulang data dan periode, mengelola sesi sementara, menghitung agregat kanonik, dan memanggil Gemini. Tidak ada database pada tahap pertama.
3. **Penyedia AI:** menerima pertanyaan yang dibatasi dan agregat yang diperlukan saja. NIP, nama, tanggal lahir, tanggal masuk, agama, institusi, jurusan, dan baris pegawai tidak dikirim.

Backend harus menentukan data yang boleh dikirim ke model; payload agregat dari browser tidak dapat dipercaya. Untuk kategori dengan jumlah sangat kecil, kebijakan ambang/supresi perlu ditetapkan sebelum fitur AI dibuka ke pengguna. API key disimpan sebagai `GEMINI_API_KEY` pada lingkungan proses backend dan tidak boleh memakai prefiks `VITE_`.

**Catatan layanan gratis:** menurut [halaman harga Gemini API](https://ai.google.dev/gemini-api/docs/pricing) dan [ketentuan Gemini API](https://ai.google.dev/gemini-api/terms), konten yang dikirim lewat free tier dapat dipakai Google untuk meningkatkan produknya. Karena itu, tahap ini tidak mengirim workbook, identitas, atau baris pegawai. Pengiriman agregat internal ke layanan eksternal tetap perlu mengikuti persetujuan tata kelola data organisasi sebelum dipakai dengan data nyata. Opsi `store: false` pada [Interactions API](https://ai.google.dev/gemini-api/docs/interactions-overview) mencegah penyimpanan objek interaksi untuk riwayat API, tetapi tidak mengubah ketentuan penggunaan konten free tier.

## Kontrak API tahap pertama

Prefix: `/api/v1`. Prototipe tanpa autentikasi hanya boleh berjalan lokal pada `127.0.0.1`; sebelum dipakai lintas pengguna atau di jaringan organisasi, semua endpoint data karyawan memerlukan identitas pengguna dan pemeriksaan izin di server. Bentuk error konsisten: `{ "code": string, "message": string, "details"?: unknown }`.

| Endpoint | Masukan | Keluaran | Catatan |
|---|---|---|---|
| `GET /health` | — | status API dan konfigurasi key | Pemeriksaan lokal. |
| `POST /sessions` | JSON snapshot hasil parser browser | `sessionId`, periode, jumlah baris, masa berlaku | Server memeriksa bentuk dasar, field wajib, dan NIP unik; sesi disimpan hanya dalam memori. |
| `POST /sessions/{sessionId}/ai/chat` | `conversationId` opsional, filter, pencarian, `message` | `conversationId`, jawaban, angka rujukan, batasan, waktu pembuatan | Pertanyaan individu yang didukung dijawab langsung dari sesi backend; Gemini menerima agregat saja. |
| `DELETE /sessions/{sessionId}` | — | `204` | Menghapus sesi segera saat pengguna mengganti file atau keluar. |

Sesi tidak bertahan setelah backend dimulai ulang. Refresh atau menutup tab mengembalikan pengguna ke upload karena token hanya berada di state React. `sessionId` adalah token acak yang tidak boleh diletakkan pada URL yang dibagikan atau log akses publik. Untuk deployment multi pengguna, autentikasi dan otorisasi wajib dibuat sebelum endpoint data pegawai dibuka.

Contoh pesan chatbot:

```json
{
  "filters": { "division": ["DIVISI CONTOH"], "status": [], "gender": [] },
  "message": "Jelaskan komposisi status karyawan pada hasil filter."
}
```

Contoh respons:

```json
{
  "conversationId": "id-acak-per-sesi",
  "answer": "...",
  "evidence": [{ "metric": "total", "value": 42, "period": "2026-07" }],
  "limitations": ["Data hanya mencakup satu snapshot; perubahan dari bulan sebelumnya tidak tersedia."],
  "generatedAt": "2026-09-25T00:00:00Z"
}
```

Nilai pada contoh respons adalah ilustrasi kontrak, bukan hasil workbook. Backend harus membatasi panjang pertanyaan, filter, ukuran file, jumlah baris, dan waktu respons. Kesalahan penyedia AI harus dikembalikan sebagai error yang dapat ditangani UI; angka dashboard tetap tersedia.

### Perilaku chatbot

- Chatbot menerima pertanyaan lanjutan dalam `conversationId` yang sama. Riwayat dibatasi jumlah pesan dan umur sesi, disimpan dalam memori backend, lalu dihapus bersama sesi. Riwayat tidak disimpan di browser storage atau database.
- Panggilan Gemini memakai `store: false`. Untuk percakapan stateless, backend perlu mengirim ulang langkah percakapan yang diperlukan sesuai kontrak Interactions API; tidak memakai `previous_interaction_id` yang memerlukan penyimpanan interaksi di layanan.
- Pada setiap giliran, backend menghitung ulang agregat dari snapshot sesi dan filter yang diterima. Konteks Gemini mencakup agregat status, gender, pendidikan, divisi, direktorat, activity, kelompok usia, masa kerja, band, serta matriks band per divisi yang sama dengan dashboard. Jawaban harus merujuk angka dari konteks itu serta menyebutkan bila data untuk pertanyaan tidak tersedia. Pergantian file atau periode mengakhiri percakapan lama.
- Chatbot menjawab pertanyaan nama, NIP, status, divisi, dan pendidikan yang tersedia di sesi langsung dari backend lokal. Pertanyaan dan jawaban yang memuat identitas tidak masuk ke riwayat yang dikirim ke Gemini. Penilaian kinerja atau tingkat keaktifan seperti “sangat baik” tidak disimpulkan jika kolomnya tidak tersedia.
- Panel chat berada di kartu AI dashboard. Mengubah filter atau pencarian memulai percakapan baru agar jawaban lama tidak tercampur dengan konteks data baru.

## Urutan implementasi

1. **Sudah:** API lokal, sesi sementara satu jam, pembatasan request 4 MB, filter dan agregasi di server, adapter Gemini [Interactions API](https://ai.google.dev/gemini-api/docs/get-started) dengan `store: false`, serta panel chatbot.
2. **Berikutnya:** pindahkan parser dan validasi lengkap Excel ke backend. Saat ini browser memvalidasi file dan backend hanya memeriksa bentuk dasar snapshot yang dikirim.
3. **Sebelum deployment:** autentikasi dan otorisasi, audit, penyimpanan aman jika diperlukan, pembatasan kuota per pengguna, serta evaluasi jawaban AI terhadap angka kanonik. [Batas free tier](https://ai.google.dev/gemini-api/docs/rate-limits) bergantung pada model dan proyek; baca kuota aktual di Google AI Studio.

## Keputusan yang masih diperlukan

- Model Gemini tertentu yang tersedia pada proyek free tier; jadikan model konfigurasi backend agar bisa diganti tanpa build frontend.
- Persetujuan organisasi untuk mengirim agregat internal ke Gemini free tier dan ambang kategori kecil yang boleh masuk konteks AI.
- Sumber identitas pengguna (SSO internal atau sistem lain), peran yang boleh melihat daftar individu, dan kebijakan audit.
- Ambang minimum jumlah anggota kategori yang boleh muncul dalam konteks AI.
- Definisi bisnis resmi untuk perbandingan periode, status gabungan, dan metrik prediktif sebelum endpoint tersebut dibuat.
