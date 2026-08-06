# Changelog

## 2.0.4 - 2026-08-07

### Fitur dan perbaikan

- Merapikan tabel Data Pegawai dan menambahkan tampilan detail pegawai tanpa menggandakan data penugasan maupun akun pengguna.
- Memperbaiki penyuntingan Kegiatan Non-Mapel agar kode dan nama yang diubah tersimpan serta tersinkron ke jadwal terkait.
- Mempertahankan pilihan hari aktif setelah jam pelajaran disimpan atau dihapus pada Pengaturan Jadwal.
- Menyatukan sumber QR kartu absensi serta mendukung foto murid dan pencetakan kartu secara massal pada kertas A4.
- Menambahkan pilihan tampilan padat dan mudah dibaca pada Cetak Jadwal Pelajaran.
- Memperbaiki tampilan multi-halaman agar tabel jadwal tetap menyatu, blok merge tetap utuh, dan ruang halaman digunakan lebih efektif.
- Memperjelas kode mata pelajaran dan kegiatan, garis tabel, keterangan guru, kop dokumen, tanda tangan, serta posisi catatan cetak.

### Catatan pembaruan

- Cadangkan database sebelum memasang pembaruan.
- Installer menggunakan port aplikasi tetap `1206` dan tidak membuat port aplikasi baru.
- Installer tidak menimpa database yang sudah ada di `%LOCALAPPDATA%\Kaganga-data`.

## 2.0.3 - 2026-07-31

### Perbaikan

- Menyatukan sumber Pengaturan Jadwal, Jadwal Pelajaran, validasi penyimpanan, dan Cetak Jadwal Pelajaran.
- Memperbaiki penyimpanan serta pemuatan ulang item mata pelajaran dan kegiatan hasil drag-and-drop.
- Memisahkan slot pelajaran dan kegiatan non-mapel agar kegiatan tidak dihitung sebagai JP.
- Menambahkan penyuntingan Kegiatan Non-Mapel serta sinkronisasi kode, nama, kategori, dan warna ke jadwal yang sudah tersimpan.
- Mencegah mata pelajaran ditempatkan pada slot kegiatan, istirahat, atau slot nonaktif.
- Memperbaiki merge blok mapel dan kegiatan agar tetap utuh setelah disimpan dan dimuat ulang.
- Memperbaiki Cetak Jadwal Pelajaran agar hanya menampilkan item yang benar-benar tersimpan, memakai template aktif, serta menggunakan garis tabel hitam.
- Menambahkan migrasi kompatibilitas untuk menyatukan data kegiatan jadwal lama tanpa menghapus data pengguna.

### Catatan pembaruan

- Cadangkan database sebelum memasang pembaruan.
- Installer menggunakan port aplikasi tetap `1206` dan tidak membuat port aplikasi baru.
- Installer tidak menimpa database yang sudah ada di `%LOCALAPPDATA%\Kaganga-data`.

## 2.0.2 - 2026-07-27

### Perbaikan

- Memperbaiki migrasi database lama yang dapat menyebabkan `500 Internal Error` setelah instalasi ulang atau pembaruan.
- Mempertahankan data pengguna saat aplikasi diperbarui dan menggunakan port aplikasi tetap `1206`.
- Memastikan installer baru hanya membawa database awal yang bersih tanpa data sekolah pengembangan.
- Memperbarui dependency transitif yang memiliki patch keamanan kompatibel.
- Memperbaiki jadwal pelajaran, cetak jadwal dan kalender pendidikan, input nilai sumatif, serta halaman Tentang Aplikasi.

### Catatan pembaruan

- Cadangkan database sebelum memasang pembaruan.
- Installer tidak menimpa database yang sudah ada di `%LOCALAPPDATA%\Kaganga-data`.
