# Unduh Excel data murid per kelas

## Penggunaan

Pada Data Murid, pilih kelas pada pemilih kelas di navbar. Buka dropdown di
sebelah Tambah Murid, lalu pilih `Download Kelas [nama kelas]`. Isi file adalah
seluruh murid aktif dalam kelas itu yang boleh diakses akun, bukan hanya baris
pada halaman tabel atau hasil pencarian nama. Opsi Download Murid Aktif tetap
memakai cakupan semua kelas sesuai izin existing.

Endpoint tambahan menggunakan parameter opsional:
`/api/murid/download-excel?status=aktif&kelas_id=ID`.
Tanpa `kelas_id`, perilaku dan nama file lama dipertahankan. Parameter kelas
juga dapat dikombinasikan dengan status arsip/semua melalui API dengan izin
arsip yang sudah berlaku.

## Batas perubahan

- `src/routes/api/murid/download-excel/+server.ts`: validasi ID kelas, sekolah
  dan semester aktif; filter kelas sebelum mengambil murid; pemeriksaan akses
  per murid tetap berlaku. Nama kelas ditambahkan pada nama file secara aman.
- `src/routes/(informasi-umum)/murid/+page.svelte`: satu tautan tambahan mengikuti
  `data.page.kelasId` yang sudah divalidasi loader; label aksesibel pada tombol
  dropdown. Tidak menambahkan modal, query kelas baru atau izin baru.
- Pola UI memakai dropdown DaisyUI existing: lebar `w-50`, padding `p-2`, font,
  border dan radius existing dipertahankan. Ini fallback Kaganga, bukan klaim
  ukuran Rapkumer baru. Tidak mengubah tabel, popup atau layout halaman.
  Lapisan dropdown dinaikkan dari z-1 ke z-20 agar tidak tertutup kolom nama
  sticky pada HP; uji browser juga memeriksa titik tengah tautan bisa ditekan.
- Format 31 kolom, status lifecycle, NIS/NISN berupa teks, satuan pendidikan
  dan pembatasan ekspor existing dipertahankan. Tidak mengubah database.

## Pengujian

Skrip `scripts/qa-murid-class-excel-copy.mjs` menggunakan database hasil
`VACUUM INTO` di `tmp/` dan server sementara terpisah. Fixture akun, kelas dan
sekolah hanya dibuat pada salinan tersebut. File hasil QA memuat data lokal
dan tidak untuk diunggah ke repository.

Menguji isi workbook ExcelJS terhadap unduhan penuh untuk dua kelas, kombinasi
status aktif/arsip/semua, nama file, kelas kosong, parameter tidak valid,
kelas tak ditemukan, sekolah lain, semester tidak aktif, penugasan guru,
izin arsip, akses tanpa login serta dropdown pada lebar 1440px dan 390px.

Hasil 28 Oktober 2026: ketujuh kelompok pengujian lulus. Screenshot dan hasil
berada di `tmp/murid-class-excel-1793161263827/`. Build dan ESLint file yang
diubah lulus. Svelte check: 0 error, 117 peringatan existing dalam 36 file.
Server lokal port 5152 dimuat ulang; tidak menerbitkan rilis GitHub.
