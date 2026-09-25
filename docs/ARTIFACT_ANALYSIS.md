# Analisis artefak dan rencana implementasi

> Pembaruan alur, September 2026: aplikasi kini selalu dimulai dari landing page sederhana dengan logo PT INTI dan kotak upload. Snapshot dummy tidak otomatis tampil. Periode diambil dari nama sheet atau file; bila tidak ditemukan, pengguna memilih bulan pada kotak upload. Setelah file valid, satu halaman dashboard terbuka dengan filter, KPI, grafik komposisi, matriks, dan daftar karyawan. Sidebar dan halaman placeholder dihapus. Grafik tren historis tidak ditampilkan karena data lintas periode belum tersedia. Uraian visual Stitch di bawah tetap merupakan analisis referensi awal, bukan spesifikasi UI terkini.

## A. Artefak

**HTML lama** (`dashboard-sdm-pt-inti-v5_4.html`, 73 KB) adalah satu halaman dengan upload XLSX/XLS/CSV, pemetaan kolom otomatis/manual, enam filter (direktorat, divisi multi, status multi, gender, band, usia), KPI headcount/status/usia/gender/divisi, grafik gender, activity, piramida usia dan masa kerja, pendidikan, status per divisi, matriks band, tabel 50 baris per halaman, cetak, ekspor CSV, drag/resize kartu, warna chart, urutan KPI, dan ekspor HTML dengan opsi menyematkan seluruh data. `localStorage` menyimpan layout, warna, dan urutan KPI. Seluruh pemetaan, filter, analitik, DOM, serta visual bercampur di satu file. Konsep upload, pemetaan, filter lintas visual, dan kustomisasi ringan dapat dipakai ulang; implementasi dan ekspor HTML berisi data pegawai tidak dibawa.

**Excel** (`DATA KARYAWAN DUMMY.xlsx`) memiliki satu sheet `Data Karyawan Bulan Jul26 ALL`, 202 baris ber-NIP unik, 35 kolom bernama dan empat kolom tanpa header. Ada tiga sel terisi dalam kolom tanpa header; semuanya diabaikan. Periode yang didukung adalah Juli 2026. Referensi tanggal `2026-07-31` dipilih karena seluruh nilai `USIA` cocok dengan perhitungan dari tanggal lahir pada tanggal itu. Ini inferensi teknis yang perlu disetujui pemilik data sebelum produksi.

**Screenshot Stitch** menunjukkan sidebar putih, aksen indigo dan cyan, header tunggal, filter horizontal, enam KPI utama, distribusi status, tren, panel AI, donut gender, piramida usia, kartu masa kerja/pendidikan/divisi, matriks band, dan direktori terpisah. Kartu putih berborder tipis, radius sekitar 12 px, ruang lapang, tipografi kecil dan padat. Header pada screenshot pertama bertumpuk; implementasi memakai satu header responsif. Angka tren, rasio retensi, skor AI, serta simulasi pada gambar adalah ilustrasi desain, bukan fakta dari workbook.

## B. Kamus data awal

| Kolom Excel | Tipe / cakupan | Peran awal |
|---|---|---|
| NIP, NAMA | teks, lengkap; NIP unik 202 | identitas pegawai |
| TANGGAL LAHIR, TANGGAL MASUK | teks `dd.mm.yyyy`, lengkap dan valid | sumber usia dan masa kerja |
| JENIS KELAMIN | kode 1/2, lengkap | sumber gender; 1=L, 2=P |
| JENIS KELAMIN 1 | teks, lengkap | label pembanding |
| PENDIDIKAN | kode 81/82/85/86/87/88/89; 1 kosong | sumber jenjang pendidikan |
| SD, SLTP, SLTA, D2, D1, D3, D4, S1, S2, S3, TOTAL | bilangan 0/1 | indikator turunan; bukan sumber jenjang |
| USIA, USIA 1 | angka dan label, lengkap | turunan, untuk validasi |
| MASKER, MASKER 1 | angka dan label, lengkap | turunan masa kerja, untuk validasi |
| BAND | angka 2–6; 107 kosong | klasifikasi jabatan bila tersedia |
| JENIS JABATAN, ACTIVITY, FUNGSI BISNIS | teks; masing-masing 100 kosong | atribut peran; kosong belum tentu error |
| JABATAN, DIREKTORAT, DIVISI, BAGIAN, STATUS | teks, lengkap | snapshot organisasi |
| AGAMA | teks, lengkap | atribut sensitif; tidak tampil pada tabel utama |
| INSTITUTE, JURUSAN | teks; 26 dan 44 kosong | riwayat pendidikan terbatas |
| POSITION | angka unik 202 | kode posisi; bukan jabatan teks |

Nilai status mempunyai 14 kategori, termasuk `Aktif` 52, `PKWT TKB` 44, `PKWT Proyek` 29, `PKWT Umum` 27, dan `CLTP` 19. Ada 3 direktorat dan 10 nilai `DIVISI`, termasuk unit DEKOM/DIR. UTAMA yang tidak selalu bermakna divisi formal. Headcount memakai NIP unik dalam semua 202 baris, bukan penjumlahan `TOTAL`.

Pemeriksaan kualitas awal: NIP duplikat 0, nama kosong 0, divisi kosong 0, status kosong 0, tanggal lahir/masuk tidak valid 0, band kosong 107, pendidikan kosong 1, `INSTITUTE` kosong 26, `JURUSAN` kosong 44, serta `JENIS JABATAN`/`ACTIVITY`/`FUNGSI BISNIS` masing-masing kosong 100. Nilai `MASKER 1` berupa `#N/A` ada 17 baris dan tidak dipakai untuk perhitungan.

## C. Masalah dan keputusan awal

1. HTML lama tidak mengenal `PKWT TKB`, `PKWT Proyek`, dan `PKWT Umum` dalam aturan KPI “Karyawan Induk (PP+PK)”. Rumusnya menghasilkan 66, tetapi definisi bisnis belum disahkan. **KPI gabungan ditahan sesuai keputusan pengguna.**
2. KPI perempuan HTML memakai `total - laki`; gender yang tak dikenali akan salah terhitung sebagai perempuan. Mesin baru memiliki kategori tidak diketahui.
3. Grup usia `<25` lalu `26–30` menghilangkan usia tepat 25. Grup baru `≤25`, `26–30`, dan seterusnya bersifat lengkap, plus tidak diketahui.
4. Parser masa kerja HTML mengambil angka pertama dari label `MASKER 1`; `#N/A` hilang, dan label `5–10` direduksi menjadi 5. Mesin baru memakai tanggal masuk. Empat nilai `MASKER` lebih rendah satu tahun dari perhitungan pada 31 Juli 2026.
5. Kode pendidikan 81 (SLTP) tidak ada di pemetaan HTML lama. Kode 82 tampak SLTA, 85 D3, 86 D4, 87 S1, 88 S2, 89 S3. Ada 8 baris ketika flag satu-hot tidak sejalan dengan kode dan 25 nilai `TOTAL=0`. Kode pendidikan dipakai sebagai sumber awal; flag/`TOTAL` hanya untuk pemeriksaan kualitas. Satu pendidikan kosong tetap “Tidak diketahui”.
6. Band kosong pada 107 baris, terutama kategori PKWT proyek/TKB/umum dan jabatan komisaris. Matriks band harus memiliki kolom “Tidak tersedia” supaya total cocok dengan headcount.
7. Tidak tersedia snapshot sebelum/sesudah Juli 2026, nilai kinerja, remunerasi, riwayat perubahan, atau label exit/join per periode. Tren, retensi, flight risk, skor AI, dan prediksi: **data belum tersedia**.
8. Ekspor HTML lama dapat membenamkan PII pegawai. Fitur itu tidak dibawa ke aplikasi baru.

## D. Arsitektur dan struktur folder

Frontend React/TypeScript strict + Vite + React Router + Tailwind dan CSS token. `src/data` berisi adapter Excel, validasi awal, dan state sesi tanpa penyimpanan otomatis. `src/analytics` berisi fungsi murni untuk filter dan agregasi. `src/components` berisi UI reusable. `src/pages` berisi layar. `src/types` menampung Employee/Snapshot/ImportBatch. `src/ai` menyiapkan kontrak hasil agregat tanpa mengirim PII. `scripts` mengonversi workbook lokal menjadi fixture test. API FastAPI/PostgreSQL akan mengganti state sesi saat data lintas periode tersedia; TanStack Query ditambahkan saat ada backend.

Model konseptual: `Employee` (NIP, nama, lahir, gender, pendidikan), `EmployeeSnapshot` (employeeId, period, organisasi, posisi, band, status, activity), `ImportBatch` (nama file, periode, waktu, jumlah baris, hasil validasi). Satu workbook sekarang menghasilkan satu snapshot.

## E. Peta halaman dan komponen

| Halaman | Isi awal |
|---|---|
| Upload Data | halaman awal; pilih workbook, validasi otomatis, langsung buka dashboard bila periode terdeteksi |
| Dashboard SDM | satu halaman berisi filter bersama, enam KPI, grafik komposisi, tabel status, matriks band, dan daftar karyawan dengan pencarian serta pagination |

Komponen saat ini: `FilterBar`, `SnapshotCharts`, `SectionCard`, `EmployeeTable`, tabel distribusi, dan matriks band. Modul AI belum muncul sebagai fitur UI karena data dan integrasinya belum tersedia.

## F. Aturan analitik awal

- Semua KPI/visual menerima daftar employee yang sudah melalui **filter yang sama**; jumlah kategori memiliki bucket tidak diketahui agar rekonsiliasi.
- Headcount = NIP unik pada snapshot Juli 2026. `Aktif` = status persis `Aktif`; label gabungan ditahan.
- Usia = selisih tanggal lahir dengan 31 Juli 2026, ulang tahun diperhitungkan; rerata hanya dari tanggal valid, denominator ditampilkan.
- Masa kerja = tahun lengkap dari tanggal masuk sampai 31 Juli 2026; kategori `<5`, `5–10`, `11–15`, `16–20`, `21–25`, `>25`.
- Pendidikan = kode kanonik; tidak diketahui dipisah dari nilai yang tidak berlaku.
- Gender = kode 1/2, label menjadi validasi; nilai lain masuk tidak diketahui.
- Matriks divisi × band memiliki kolom band tidak tersedia. Divisi berarti nilai literal Excel, bukan klaim 10 divisi formal.
- Tren dan perbandingan periode hanya dihitung bila ada minimal dua snapshot valid.

## G. Fase migrasi

1. **Fondasi**: scaffold, token visual, navigasi, repository prototipe, adapter Excel, analytics murni, dashboard dan direktori responsif, test aturan.
2. **Import & kualitas data**: upload, mapping manual, validasi bertingkat, preview, batch dan audit.
3. **Monitoring historis**: beberapa snapshot, diff NIP, join/exit/transfer/status/band dengan aturan bisnis disetujui.
4. **Backend & akses**: FastAPI/Pydantic/SQLAlchemy/PostgreSQL, autentikasi, otorisasi, audit, penyimpanan aman.
5. **INTI AI**: ringkasan dari agregat terstruktur, filter bahasa alami tervalidasi, penjelasan tabel dan kualitas data. Evaluasi sebelum klaim akurasi.
