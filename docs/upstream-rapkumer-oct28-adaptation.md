# Adaptasi Rapkumer 28 Oktober 2026

Referensi upstream: `824d10b1fc9f44feb300ab0a84ea1d7c363f4577`.
Baseline Kaganga: `64968ae0e42c8780eb24a6467aad97ae9fda97ea` (v2.2.9).
Tidak melakukan merge penuh, perubahan versi, push, atau rilis.

## Tahapan

1. Selesai: backup database lokal beserta manifest lampiran dibuat sebelum perubahan.
2. Selesai: bandingkan transaksi bobot, impor nilai, pemulihan, dock HP, dan tanda tangan.
3. Selesai: tetapkan batas; rumus dan rapor historis dipertahankan, tiga NPSN dan penugasan tidak diubah.
4. Selesai: transaksi pengaturan bobot dan nilai semester aktif; rollback diuji pada salinan.
5. Selesai: izin tindakan, sekolah, kelas, dan mapel pada impor diuji.
6. Selesai: validasi nilai 0-100, nol, kosong, dan identitas ambigu diuji.
7. Selesai: gerbang pemulihan menunggu permintaan dan pekerjaan latar yang sudah berjalan.
8. Selesai: unit test drain, timeout, rollback, fail-closed, dan pemulihan HTTP pada database paket salinan lolos.
9. Selesai: kebijakan tampilan menu bersama untuk sidebar, favorit, pencarian, dan dock.
10. Selesai: dock HP, dialog maksimal 85dvh, ruang aman konten, dan enam role lolos QA browser.
11. Selesai: tanda tangan kepsek opsional; fallback wali kelas hanya jika ID pegawai sama.
12. Selesai: regresi salinan, UI, cetak, build/check; server lokal 5152 dimuat ulang dan login HTTP 200.

## Acuan UI Sebelum Implementasi

| Bagian       | Sumber terverifikasi                                      | Penerapan                                                  |
| ------------ | --------------------------------------------------------- | ---------------------------------------------------------- |
| Dock         | Rapkumer `mobile-dock.svelte`, commit `2ddf7d7`           | DaisyUI dock; hanya layar di bawah 768px                   |
| Isi dock     | Sumber yang sama                                          | Beranda, maksimal tiga pintasan berizin, menu lengkap      |
| Menu lengkap | Sumber yang sama                                          | Dialog bawah, maksimum 85dvh, badan dapat digulir          |
| Drawer       | Kaganga `+layout.svelte`                                  | Breakpoint 1024px dipertahankan                            |
| Hak akses    | Kaganga `menu.svelte`, `role-menu-access.ts`              | Gunakan kebijakan lokal, bukan role upstream               |
| Ruang bawah  | Penyesuaian Kaganga, bukan ukuran Rapkumer tersertifikasi | Tinggi dock ditambah safe-area; verifikasi melalui browser |

Ukuran di atas berasal dari kode, belum merupakan pengukuran screenshot.
Tes penulisan wajib memakai database salinan dalam `tmp`, bukan database aktif.

## Hasil Verifikasi

- Backup awal: `data/database-backup-manual-2026-10-28T10-22-39-587Z.sqlite3` beserta manifest lampiran.
- Seluruh unit test: 340 lulus, 0 gagal (`tmp/unit-upstream-oct28.log`).
- Regresi database salinan: 7 kelompok lulus; RTS/RAS, riwayat, rollback, impor, dan identitas penandatangan (`tmp/test-upstream-oct28-copy.log`).
- Uji pemulihan HTTP: unggahan rusak/terlalu besar ditolak, maintenance dan penolakan restore bersamaan, backup sebelum impor, logout, 114 tabel, quick_check OK, 0 pelanggaran FK (`tmp/import-http-upstream-oct28.log`). Sumbernya database paket kosong, bukan data sekolah.
- Uji akhir maintenance: 4 lulus, termasuk pemulihan yang gagal karena constraint dan rollback schema/data (`tmp/maintenance-final-oct28.log`).
- QA browser: 320, 360, 390, 430, 768, 1024, 1366, 1440, 1920px, serta layar mendatar 667x375; tanpa overflow halaman. Dock tampil hanya di bawah 768px, maksimal 5 item, konten tidak tertutup (`tmp/qa-dock-oct28.log`).
- Role QA: guru, wali asuh, wali asrama, tim dapur, tim keamanan, admin. Kebijakan drawer dan dialog sama, favorit terlarang disembunyikan, navigasi scan/tabel dan keyboard lolos.
- Screenshot dan ukuran aktual: `tmp/dashboard-ui-after-1793186022518/`; gambar menu HP diperiksa secara visual.
- Cetak: rapor biasa, rapor SR, piagam 1/2; gambar termuat, tinggi dokumen dan posisi nama tidak bergeser. Screenshot/PDF sintetis: `tmp/print-signatures-1793186680307/`. Tidak memakai tanda tangan pegawai asli.
- Build berhasil (`tmp/build-upstream-oct28.log`). Svelte check: 0 error, 116 warning lama pada 35 berkas (`tmp/check-upstream-oct28.log`).
- ESLint modul baru bersih. Pada berkas lama tersentuh terdapat 28 error; jumlah dan jenisnya juga ditemukan pada HEAD sebelum perubahan (`tmp/lint-changed-upstream-oct28.log`, `tmp/lint-baseline-upstream-oct28.json`). Tidak melakukan refaktor lint di luar tugas.
- Server pengembangan: `http://localhost:5152/login` HTTP 200; port 1206 tidak dihentikan. Versi tetap 2.2.9, belum commit/push/rilis.

## Batasan dan Pemeriksaan Manual

- Kegagalan rollback total diuji melalui state fail-closed unit test, bukan dengan sengaja merusak database server melalui HTTP.
- QA cetak memakai font fallback offline dan tanda QA sintetis. Periksa sekali lagi PDF dengan aset resmi serta hasil cetak fisik sebelum digunakan untuk dokumen resmi.
- Opsi tanda tangan digital default mati; wali kelas lain tetap memakai tanda tangan basah. Ini bukan sistem unggah tanda tangan pribadi guru.
- Proses pemulihan ditolak pada deployment multi-worker PM2; gunakan satu proses server utama sesuai arsitektur Kaganga.
