# Data Asrama per semester

Data Asrama mengikuti semester dan tahun ajaran aktif pada Data Rapor. Sesuai keputusan pengguna, periode baru dimulai kosong: asrama, wali, dan penghuni ditetapkan kembali tanpa penyalinan otomatis. Tata letak kartu dan formulir dipertahankan; halaman mendapat banner biru periode aktif.

## Penyimpanan dan pembatasan

- Kolom `asrama.semester_id` mengikat gedung beserta kamar ke satu semester. Migrasi mengikat asrama lama yang belum dihapus ke periode aktif satu kali, mempertahankan ID dan seluruh relasi.
- Nama asrama dapat digunakan kembali pada periode berbeda. Periode suatu asrama yang telah ditetapkan tidak dapat dipindah.
- Daftar asrama, pilihan navbar, penempatan, penugasan dan penilaian operasional mengikuti periode aktif. Formulir lama dan permintaan langsung ke ID periode lain ditolak.
- Murid dengan penempatan di periode lama dapat diambil kembali pada periode baru. Penempatan lama diakhiri melalui transaksi penempatan baru dan tetap tercatat di riwayat.
- Semua Murid dan Murid Pasif tetap memakai data identitas serta penempatan terakhir secara mandiri dari periode rapor. Akses riwayat penilaian dan cetak mempertahankan data lama.

## Verifikasi

- Uji migrasi: pengikatan sekali, pemanggilan bersamaan, restart, perubahan semester/tahun, nama sama lintas periode, larangan pindah periode/sekolah, dan retensi data.
- `scripts/test-student-registry.mjs`: lulus, termasuk periode baru kosong, wali/penghuni kosong, formulir kedaluwarsa, penempatan ulang dan riwayat.
- `scripts/test-dorm-evaluation-copy.mjs`: lulus, termasuk pembatasan wali asuh, impor/ekspor, PDF dan arsip historis.
- Build produksi dan ESLint berkas terkait lulus. `pnpm check`: 0 galat, 119 peringatan lama.
- QA browser pada database salinan: banner Ganjil/Genap, tampilan 1440/390 px tanpa overflow halaman, formulir, semester baru kosong, dan pembuatan asrama tanpa wali/penghuni otomatis.
- Migrasi database lokal: hash seluruh isi kamar, penempatan, penugasan, evaluasi, nilai, catatan, murid dan identitas tetap sama; pemeriksaan foreign key bersih. Satu asrama aktif terikat Semester Ganjil 2026/2027. Periode aktif operasional tidak diubah.
- Skrip lama `test-dormitory-copy.mjs` masih gagal karena fixture pegawainya tidak menetapkan jenis Wali Asrama yang diwajibkan sistem. Uji penempatan dan hak akses terkini dicakup oleh dua pengujian integrasi yang lulus di atas.

Cadangan sebelum perubahan: `data/database-backup-pre-asrama-per-semester-2026-11-09T14-02-15-393Z.sqlite3`.
