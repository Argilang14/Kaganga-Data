# Perbaikan Akses dan Absensi: Tahap 1-10

Lingkup: perbaikan lokal Kaganga v2.2.2. Tidak membuat installer, merilis ke GitHub,
mengubah akun produksi, atau mengoperasikan port 1206.

## Akses Pimpinan

- Kepala sekolah, seluruh waka, dan operator mengikuti Jabatan Akses untuk
  operasional sekolah yang ditugaskan, walaupun peran dasarnya guru atau wali.
- Tombol tambah murid tidak lagi diblokir oleh pembatas baca-saja guru.
- Pemilih kelas, mapel, jadwal, jurnal dan konteks cetak mengenali Jabatan Akses.
- Manajemen pengguna, database, backup dan izin sistem tidak otomatis diberikan.
- Operator tidak otomatis mendapat izin persetujuan dokumen pimpinan.
- Akun lama, password dan penugasan tidak direset. Cookie client tidak dapat
  mengganti sekolah penugasan akun non-admin.

## Guru dan Wali

| Akun              | Murid yang dapat diakses                     | Input absensi                     |
| ----------------- | -------------------------------------------- | --------------------------------- |
| Guru              | Kelas yang ditugaskan di akun                | Kegiatan sekolah atau akses Semua |
| Wali kelas        | Kelas penugasan pada Data Kelas              | Kegiatan sekolah atau akses Semua |
| Wali asuh         | Anak dengan penugasan wali asuh yang cocok   | Kegiatan asrama atau akses Semua  |
| Wali asrama       | Anak dengan penugasan wali asrama yang cocok | Kegiatan asrama atau akses Semua  |
| Pimpinan/operator | Seluruh kelas sekolah penugasan              | Operasional sekolah penugasan     |

Guru dan wali mendapat izin dasar otomatis: lihat, scan, input, koreksi hari ini,
dan ekspor dalam cakupan penugasan. Izin ini ditandai Otomatis pada form izin akun.
Penambahan izin tidak memperluas kelas atau anak binaan.

Admin dapat memberikan izin terpisah untuk koreksi tanggal lama, izin pulang,
impor, pengaturan kegiatan, pengelolaan/reset QR dan sinkronisasi ke raport.
Tanggal mendatang dan input di luar semester aktif tetap ditolak.

## Perlindungan Perubahan

- Pembatas diterapkan pada server, bukan hanya tombol: URL murid, foto,
  input manual/massal, scan, rekap, ekspor, template dan kartu QR.
- Koreksi/hapus catatan yang sudah ada membutuhkan alasan maksimal 500 karakter.
- Scan ulang tidak menimpa sakit/izin/alfa atau membuat catatan ganda.
- Opsi Hanya yang belum absen tidak menimpa status yang sudah tercatat.
- Scan QR hanya mencatat hadir/terlambat; status lain melalui input manual.
- Input/koreksi/hapus absensi manual dan scan menyimpan operator, waktu,
  perangkat, data sebelum/sesudah dalam transaksi bersama perubahan.
- Pembaruan QR beserta pencabutannya dan audit disimpan dalam satu transaksi
  per murid. Token rahasia tidak ditulis ke audit.
- Pembukaan rekap oleh guru/wali biasa tidak menjalankan pengisian alfa otomatis.
  Mekanisme auto-alfa lama hanya berjalan bagi akun yang berizin pengaturan.

## Persiapan Uji Coba Sekolah

1. Admin memeriksa sekolah, pegawai, Jabatan Akses, kelas dan mapel tiap akun.
2. Pastikan wali kelas terpasang pada Data Kelas; penugasan wali asuh/asrama
   di data murid sesuai nama pegawai. Nama wali yang kosong atau ganda ditolak
   oleh pemeriksaan cakupan; perbaiki penugasannya terlebih dahulu.
3. Tetapkan satu petugas resmi absensi harian sekolah per kelas. Guru mapel
   gunakan kegiatan/mapel yang ditetapkan sekolah, wali gunakan kegiatan asrama.
   Sistem harian menyimpan satu status per murid/tanggal, bukan per mapel.
4. Berikan izin berisiko hanya kepada petugas yang benar-benar memerlukan.
5. Uji akun pimpinan, guru, wali kelas, wali asuh dan wali asrama dengan penugasan
   nyata sebelum dipakai massal. Siapkan backup sebelum memperbarui PC sekolah.

Generator akun massal tahap 11-15 dijelaskan di `akun-massal-dan-penerapan.md`.
Instalasi di PC sekolah tetap menunggu persetujuan terpisah.

## Verifikasi

```powershell
$tests = @(rg --files src -g '*.test.ts')
node --test @tests
pnpm check
pnpm build
node scripts/test-access-absensi-copy.mjs
node scripts/test-murid-identity-copy.mjs
```

QA memakai database salinan pada direktori `tmp`, akun buatan khusus QA dan
server sementara terpisah. Database produksi tidak diisi akun atau murid QA.
Uji mencakup simpan murid oleh pimpinan, larangan pengaturan sistem,
penugasan kelas/anak, izin berisiko, input/koreksi, scan berulang/bersamaan,
ekspor isi binaan, pembaruan QR, audit, foreign key dan tampilan lintas ukuran.

Backup sebelum perubahan:
`data/database-backup-pre-access-absensi-2026-10-04T01-02-02-910Z.sqlite3`
beserta manifest lampirannya.
