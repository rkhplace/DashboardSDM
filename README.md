# INTI Human Capital Intelligence

Fondasi aplikasi SDM PT INTI (Persero) berbasis React, TypeScript, Vite, React Router, dan Tailwind CSS. Rincian temuan artefak, kamus data, aturan bisnis, serta fase migrasi ada di [Analisis artefak](docs/ARTIFACT_ANALYSIS.md).

Rancangan backend dan kontrak integrasi AI tahap awal ada di [Bedah backend dan integrasi AI](docs/BACKEND_AI_DESIGN.md).

## Menjalankan

```powershell
npm install
npm run dev
```

`npm run dev` menyalakan Vite dan API lokal pada `127.0.0.1:8787`. File `.env` sudah disiapkan; isi `GEMINI_API_KEY` dengan key dari Google AI Studio untuk mencoba chatbot, lalu mulai ulang server. File `.env` diabaikan oleh Git. Tanpa key, upload dan dashboard tetap berjalan, tetapi chatbot menampilkan pesan konfigurasi saat ditanya. Model awal adalah `gemini-3.1-flash-lite` dan dapat diganti melalui `GEMINI_MODEL`.

## Deploy di Vercel

Gunakan framework Vite dengan output `dist`. Folder `api` menyediakan Vercel Function untuk chatbot; `vercel.json` menangani URL halaman dashboard. Pada deployment, upload dan dashboard berjalan di browser dan periode tersimpan di IndexedDB perangkat pengguna. Setiap pertanyaan chatbot mengirim snapshot aktif beserta periode sebelumnya (dikompresi gzip) ke fungsi backend Vercel, tanpa database atau sesi server. Fungsi menolak permintaan tanpa header Origin dari domain sendiri; tambahkan domain lain lewat `CHAT_ALLOWED_ORIGINS` bila perlu. Untuk mengaktifkan AI, atur `GEMINI_API_KEY` sebagai environment variable pada proyek Vercel lalu redeploy. Nilai pada `.env` lokal tidak otomatis tersedia di Vercel. Batas payload Vercel Function berlaku untuk ukuran data yang dikirim saat chat.

Buka URL lokal yang ditampilkan Vite. Halaman awal menampilkan logo PT INTI dan satu kotak upload. Pilih `.xlsx`; aplikasi membaca dan memeriksa file, mengambil periode dari nama sheet atau nama file, lalu langsung membuka dashboard. Jika periode tidak ditemukan, pilih bulan data pada kotak upload untuk melanjutkan. Dashboard adalah satu halaman berisi KPI, grafik, matriks, daftar karyawan, dan chatbot pada kartu AI. Setiap file disimpan sebagai satu periode (bulan) di IndexedDB browser perangkat tersebut, sehingga memuat ulang membuka kembali periode terakhir dan halaman upload menampilkan daftar periode tersimpan (buka atau hapus). Upload ulang periode yang sama menggantikan data lamanya. Sesi chatbot di backend lokal tetap sementara (maksimal satu jam).

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

Chatbot juga bisa menjawab pertanyaan antarperiode, kontrak PKWT, dan kualitas data lewat alat `query_trends`, `project_contracts`, dan `check_data_quality`, serta menyusun ringkasan bulanan dari tombol "Ringkasan periode ini" (rincian di dokumen backend). Chatbot memakai Gemini untuk membaca konteks agregat dan meminta perhitungan tambahan dari backend lokal sesuai pertanyaan: hitung, rata-rata, filter, dan distribusi dua kategori. Kategori yang tersedia dibaca dari file aktif, sehingga jawaban tidak bergantung pada daftar nilai yang ditulis khusus untuk file contoh. Pertanyaan yang memuat identitas karyawan diproses lokal; nama dan NIP tidak dikirim ke Gemini. Model menerima ringkasan agregat, nama kategori, dan hasil perhitungan yang dimintanya. Menurut [ketentuan Gemini API](https://ai.google.dev/gemini-api/terms), konten yang dikirim lewat free tier dapat dipakai Google untuk meningkatkan produknya. Pakai data nyata hanya setelah kebijakan organisasi mengizinkan pengiriman agregat internal ke layanan tersebut.

## Struktur

- `src/analytics`: fungsi murni untuk filter dan agregasi; seluruh KPI dan tabel menerima record yang sudah terfilter.
- `src/data`: adapter Excel, pemeriksaan kualitas, state sesi, penyimpanan periode (`snapshotStore.ts`), dan fixture snapshot untuk test.

## Penyimpanan periode dan integrasi Portal HC

Semua akses data periode lewat antarmuka `SnapshotStore` di `src/data/snapshotStore.ts` (`list`, `get`, `getAll`, `save`, `remove`). Implementasi saat ini memakai IndexedDB, jadi data hanya ada di browser perangkat yang meng-upload dan hilang bila data situs browser dihapus; file Excel asli tetap menjadi sumber cadangan. Saat akses Portal HC tersedia, buat implementasi `SnapshotStore` baru yang mengambil snapshot per periode dari API/database HC lalu ganti ekspor `snapshotStore`; analitik, dashboard, dan chatbot tidak perlu diubah. Karena data karyawan tersimpan di browser, gunakan aplikasi di perangkat kerja pribadi, bukan komputer bersama.
- `src/types`: kontrak employee, snapshot, dan import batch.
- `src/components`: filter, grafik, kartu, dan daftar karyawan.
- `src/pages`: halaman upload dan dashboard.
- `src/ai` dan `server`: konteks agregat, sesi sementara, dan adapter Gemini untuk chatbot.

Dashboard menampilkan angka, tabel, dan grafik komposisi interaktif untuk periode aktif. Pemilih periode di header mengganti periode aktif. Bagian **Analisis antar-periode** membandingkan periode aktif dengan periode sebelumnya yang tersimpan: tren jumlah karyawan, masuk/keluar (NIP baru/hilang), turnover, mutasi unit, serta perubahan band dan status. Sesuai arahan HC (Oktober 2026), PKWT yang keluar, baik karena kontraknya selesai maupun mengundurkan diri, tidak dihitung sebagai turnover; turnover = keluar non-PKWT ÷ rata-rata karyawan non-PKWT. Panel **Kontrak PKWT berakhir** berfungsi sebagai early warning bagi atasan dan menampilkan tindak lanjut kontrak yang sudah jatuh tempo (diperpanjang, diangkat tetap, selesai, atau belum ada keputusan) dibandingkan dengan periode pembanding. Panel ini membaca kolom opsional `TANGGAL SELESAI KONTRAK` (alias: `TANGGAL AKHIR KONTRAK`, `TGL SELESAI KONTRAK`, dan lainnya di `CONTRACT_END_COLUMNS`). Bila file punya kolom tanggal selesai kontrak, daftar karyawan menampilkan kolom **Selesai kontrak**. Ekspor Excel dan laporan PDF memuat bagian analisis antar-periode (ringkasan per periode, masuk & keluar) dan kontrak PKWT (proyeksi, daftar, tindak lanjut) sesuai filter dan pengaturan panel saat diekspor. Kinerja, remunerasi, serta prediksi tidak dihitung karena data sumbernya belum tersedia. KPI “Karyawan Induk” gabungan ditahan sampai definisi status resmi disepakati.
