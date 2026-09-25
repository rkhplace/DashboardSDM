# INTI Human Capital Intelligence

Fondasi aplikasi SDM PT INTI (Persero) berbasis React, TypeScript, Vite, React Router, dan Tailwind CSS. Rincian temuan artefak, kamus data, aturan bisnis, serta fase migrasi ada di [Analisis artefak](docs/ARTIFACT_ANALYSIS.md).

Rancangan backend dan kontrak integrasi AI tahap awal ada di [Bedah backend dan integrasi AI](docs/BACKEND_AI_DESIGN.md).

## Menjalankan

```powershell
npm install
npm run dev
```

`npm run dev` menyalakan Vite dan API lokal pada `127.0.0.1:8787`. File `.env` sudah disiapkan; isi `GEMINI_API_KEY` dengan key dari Google AI Studio untuk mencoba chatbot, lalu mulai ulang server. File `.env` diabaikan oleh Git. Tanpa key, upload dan dashboard tetap berjalan, tetapi chatbot menampilkan pesan konfigurasi saat ditanya. Model awal adalah `gemini-3.1-flash-lite` dan dapat diganti melalui `GEMINI_MODEL`.

Buka URL lokal yang ditampilkan Vite. Halaman awal menampilkan logo PT INTI dan satu kotak upload. Pilih `.xlsx`; aplikasi membaca dan memeriksa file, mengambil periode dari nama sheet atau nama file, lalu langsung membuka dashboard. Jika periode tidak ditemukan, pilih bulan data pada kotak upload untuk melanjutkan. Dashboard adalah satu halaman berisi KPI, grafik, matriks, daftar karyawan, dan chatbot pada kartu AI. Memuat ulang aplikasi mengembalikan alur ke upload; data sesi disimpan hanya pada memori backend lokal selama paling lama satu jam, tanpa database atau browser storage.

Untuk verifikasi:

```powershell
npm test
npm run build
npm run lint
```

## Data prototipe

`src/data/snapshot-2026-07.json` dibangkitkan dari workbook dummy Juli 2026 untuk fixture test dan analisis; nama, NIP, serta tanggal lahir/masuk diganti dengan nilai sintetis sebelum disimpan. Aplikasi tidak memuatnya otomatis. Untuk memperbarui fixture setelah workbook berubah:

```powershell
python scripts/build_snapshot.py "..\DATA KARYAWAN DUMMY.xlsx"
```

Python membutuhkan `openpyxl` untuk konversi. Adapter browser di `src/data/excelAdapter.ts` membaca `.xlsx` dan memeriksa kolom serta kualitas dasar, lalu mengirim snapshot ke API lokal untuk sesi sementara. API prototipe hanya bind ke `127.0.0.1` dan belum memiliki autentikasi; jangan mengeksposnya ke jaringan atau memakainya untuk produksi.

Chatbot memakai Gemini untuk membaca konteks agregat dan meminta perhitungan tambahan dari backend lokal sesuai pertanyaan: hitung, rata-rata, filter, dan distribusi dua kategori. Kategori yang tersedia dibaca dari file aktif, sehingga jawaban tidak bergantung pada daftar nilai yang ditulis khusus untuk file contoh. Pertanyaan yang memuat identitas karyawan diproses lokal; nama dan NIP tidak dikirim ke Gemini. Model menerima ringkasan agregat, nama kategori, dan hasil perhitungan yang dimintanya. Menurut [ketentuan Gemini API](https://ai.google.dev/gemini-api/terms), konten yang dikirim lewat free tier dapat dipakai Google untuk meningkatkan produknya. Pakai data nyata hanya setelah kebijakan organisasi mengizinkan pengiriman agregat internal ke layanan tersebut.

## Struktur

- `src/analytics`: fungsi murni untuk filter dan agregasi; seluruh KPI dan tabel menerima record yang sudah terfilter.
- `src/data`: adapter Excel, pemeriksaan kualitas, state sesi, dan fixture satu snapshot untuk test.
- `src/types`: kontrak employee, snapshot, dan import batch.
- `src/components`: filter, grafik, kartu, dan daftar karyawan.
- `src/pages`: halaman upload dan dashboard.
- `src/ai` dan `server`: konteks agregat, sesi sementara, dan adapter Gemini untuk chatbot.

Dashboard menampilkan angka, tabel, dan grafik komposisi interaktif untuk file aktif. Grafik tren dari masa ke masa tidak ditampilkan karena hanya satu snapshot yang tersedia. Retensi, kinerja, remunerasi, serta prediksi tidak dihitung karena data sumbernya belum tersedia. KPI “Karyawan Induk” gabungan ditahan sampai definisi status resmi disepakati.
