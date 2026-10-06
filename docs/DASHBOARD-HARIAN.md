# Dashboard harian

Agenda Hari Ini dinonaktifkan sementara pada dashboard, termasuk query agenda dan jadwal. Panel Absensi Hari Ini dan Data Belum Lengkap tetap terpisah, dengan ikon bawaan aplikasi. Pembacaan kalender hari libur tetap digunakan untuk status hari non-efektif.

- Tanggal mengikuti Asia/Jakarta. Presensi harian bukan akumulasi absensi raport.
- Belum diisi berbeda dari Alfa. Ringkasan pegawai menghitung catatan presensi tersimpan, bukan perkiraan dinas luar.
- Absensi, Agenda, dan Data Belum Lengkap berada dalam tiga panel terpisah di bawah statistik mata pelajaran. Daftar Sakit, Izin, dan Alfa memuat nama serta kelas hari ini, dibatasi akses murid yang sama dengan hitungan, dan dipaginasi 20 anak per status.
- Murid dibatasi sekolah, tahun/semester aktif, kelas yang ditugaskan, dan nama wali yang unik. Akun tanpa penugasan tidak memperoleh rincian murid dari ringkasan baru.
- Pegawai hanya terlihat untuk admin atau izin administrasi_presensi_pegawai. Hanya nama dan jenis pegawai yang diperiksa; NIP dan foto pegawai tidak dianggap wajib.
- Agenda menggunakan konteks jadwal jurnal; maksimal 10 agenda kalender dan 20 slot. Hari libur sekolah tidak menampilkan slot rutin. Tautan jurnal mempertahankan kelas, tanggal, dan jenis jadwal.
- QR yang belum lengkap berarti tidak ada token aktif pada qr_murid. Token yang dicabut tidak dianggap aktif.
- Filter daftar murid belum_lengkap=foto atau qr tetap menggunakan pembatasan kelas rute yang sudah tersedia. Tautan dashboard hanya diberikan kepada admin.
- Tidak ada migrasi schema atau perubahan isi database oleh ringkasan baru. Uji browser menggunakan VACUUM INTO database salinan pada port sementara 5153, tanpa mengoperasikan 1206.

Pengujian: node --test src/lib/dashboard-summary.test.ts; pnpm check; pnpm build; node scripts/test-dashboard-copy.mjs.
