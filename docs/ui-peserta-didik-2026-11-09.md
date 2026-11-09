# Peserta Didik: tabel dan konteks penempatan

Lingkup: Semua Murid, Murid Kelas, Murid Asrama, Murid Pasif, dan akses detail dari Status & alumni. Tidak mengubah desain cetak maupun hak akses.

## Referensi sebelum perubahan

Referensi lokal Rapkumer: `../rapkumer/src/app.css`, `../rapkumer/src/routes/(informasi-umum)/murid/+page.svelte`, dan komponen navbar/layout. Kaganga menggunakan Svelte 5, Tailwind 4, DaisyUI 5; tidak menambah dependensi.

| Unsur                 | Sumber / dimensi                                                                                  | Kategori                                     |
| --------------------- | ------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| Sidebar / navbar      | Rapkumer `src/app.css`: 17.5rem / 4rem                                                            | Verified Rapkumer (sumber lokal)             |
| Gutter / radius       | Rapkumer `src/app.css`: 1rem / 0.5rem                                                             | Verified Rapkumer (sumber lokal)             |
| Modal detail          | Rapkumer route murid: `p-4 sm:max-w-2xl`; dipertahankan                                           | Verified Rapkumer (sumber lokal)             |
| Tombol aksi           | Rapkumer route murid: `btn btn-sm btn-soft`, ikon mata                                            | Verified Rapkumer (sumber lokal)             |
| Banner konteks        | Kaganga Data Kelas: `alert alert-info alert-soft mb-6`, ikon info                                 | Fallback Kaganga; sesuai contoh pengguna     |
| Lebar toolbar sebelum | 1071px pada viewport 1440px; pencarian hanya 448px                                                | Measured from screenshot/runtime Kaganga     |
| Tinggi baris sebelum  | Semua/Pasif 67px, Kelas 57px, Asrama 85px pada fixture 1440px                                     | Measured from screenshot/runtime Kaganga     |
| Sel tabel             | Kaganga `student-workspace.css`: 0.75rem vertikal, 1rem horizontal                                | Fallback Kaganga, dipertahankan              |
| Kolom                 | Nomor 3.25rem; status 10rem; kelas 9rem; asrama 12rem; riwayat 8rem; aksi 6.5rem; wali asuh 13rem | Fallback Kaganga; nama memakai ruang tersisa |

Penyesuaian khusus tabel Murid Asrama: lebar minimum 66rem, status 8rem, kelas 7rem, asrama 9rem, wali asuh 11rem, riwayat 6.5rem. Kolom nama tetap fleksibel. Ini perubahan kepadatan tabel yang diminta pengguna, bukan ukuran upstream Rapkumer.

Pengukuran awal dan tangkapan layar tersimpan di `tmp/peserta-ui-before/`. Ukuran bukan klaim pengukuran UI upstream daring.

## Perilaku yang dituju

- Semua tabel memiliki akses detail murid; riwayat dan aksi yang sudah ada dipertahankan.
- Murid Kelas mengikuti pilihan navbar dan menampilkan banner kelas, semester, tahun ajaran. Pilihan kelas ganda di toolbar dihapus; pencarian memenuhi ruang halaman.
- Murid Asrama mengikuti pilihan navbar, termasuk keadaan belum memilih asrama. Pencarian membawa ID asrama terpilih. Nama menu dipersingkat.
- Semua Murid dan Murid Pasif menggunakan identitas/penempatan terakhir lintas periode. Pergantian semester/tahun rapor tidak otomatis mengosongkan label kelas atau membuat murid menjadi pasif. Penempatan ke kelas tujuan tetap mengikuti semester aktif dan pemeriksaan izin yang sudah ada.
- Detail murid menampilkan asrama saat ini berdasarkan identitas tetap, sehingga dapat dibuka dari data murid lintas periode.
- Tabel lebar tetap bergulir horizontal di dalam area tabel; shell, tipografi, modal, dan pola tombol dipertahankan.

## Hasil verifikasi

- `node scripts/test-student-registry.mjs`: lulus pada salinan database. Meliputi invariansi daftar/kelas/status pasif saat tahun rapor berubah, penempatan ulang, riwayat, isolasi sekolah/peran, dan pemilihan asrama kosong/eksplisit sesuai navbar.
- `pnpm check`: 0 galat, 119 peringatan yang sudah ada. ESLint pada seluruh berkas kode yang diubah lulus. Build produksi lulus.
- Browser pada database fixture terpisah: 28 kombinasi halaman/viewport, empat halaman pada 1920, 1440, 1280, 1024, 768, 390, dan 320px; tidak ada overflow halaman atau galat JavaScript. Tabel tetap dapat digeser.
- Pembukaan detail dari Semua Murid, Murid Pasif, Murid Asrama, dan Status & alumni lulus. Pencarian asrama mempertahankan ID, perpindahan navbar mengubah banner kelas/asrama, hasil kosong tampil, fokus area tabel dapat dicapai, dan mode gelap 390px diperiksa.
- Pada 1440px: pencarian Murid Kelas 1071px, sama dengan toolbar; pencarian asrama sekitar 1000px ditambah tombol Cari. Tinggi baris asrama turun dari 85px menjadi 66px. Tangkapan layar dan pengukuran tersedia di `tmp/peserta-ui-after/`.
- Server pengguna di 5173 tetap berjalan; modul Vite yang dilayani sudah memuat perubahan banner dan aksi. Pengujian login/interaksi menggunakan salinan database, tanpa menambah akun uji ke database operasional.

Belum menguji semua dialog simpan/hapus secara visual pada setiap lebar layar; kontrak mutasi dan izin dicakup pengujian integrasi yang sudah ada. Tidak membuat rilis/commit GitHub untuk perubahan ini.
