# Changelog

## 2.2.0 - 2026-09-28

### Fitur utama

- Menambahkan fondasi arsip murid dan alumni, riwayat kelas, audit aktivitas, pusat persetujuan, manajemen berkas, notifikasi, serta operasional server dan backup.
- Menambahkan dashboard pimpinan, inventaris dan sarana prasarana, pengumuman dan agenda, komunikasi terintegrasi, Portal Wali Murid berbasis akun, manajemen ruangan, rekomendasi jadwal, dan sesi ujian.
- Menambahkan kartu peserta ujian, penyempurnaan kartu absensi atau kartu pelajar, pratinjau PDF, dan tata letak delapan kartu pada kertas A4.
- Menambahkan pemantauan absensi kegiatan, pencatatan izin pulang, tindak lanjut sakit atau alfa berulang, serta PDF rekap absensi kegiatan.

### Penyempurnaan

- Merapikan dashboard, Data Pegawai, Riwayat Pertumbuhan, Martikulasi, Presensi Pegawai, Rekap Kegiatan, menu Cetak, dan navigasi responsif.
- Menyempurnakan manajemen pengguna, ringkasan penugasan, sesi perangkat, keamanan perubahan data, dan pengaturan izin fitur baru.
- Memindahkan formulir impor Rekap Kegiatan dan Catat Izin Pulang ke dialog khusus yang lebih ringkas dan responsif.
- Mengelompokkan Portal Wali Murid, Komunikasi, serta Pengumuman dan Agenda ke menu Lain-lain tanpa mengubah izin masing-masing.
- Memperkuat penyimpanan foto dan lampiran di luar SQLite, thumbnail, pembersihan file, pemeriksaan kesehatan database, serta backup bertingkat.

### Catatan pembaruan

- Cadangkan database dan folder lampiran sebelum memasang pembaruan.
- Installer tetap memakai `AppId` Kaganga yang sama, port `1206`, dan direktori data `%LOCALAPPDATA%\Kaganga-data`.
- Data sekolah tidak dimasukkan ke installer dan database pengguna tidak ditimpa saat pembaruan.
- Kaganga membuat backup otomatis sebelum migrasi versi baru dijalankan.

## 2.1.9 - 2026-09-21

### Fitur dan perbaikan

- Menambahkan impor, pratinjau, dan ekspor Excel untuk data kokurikuler.
- Memperketat pembatasan pengelolaan intrakurikuler dan kokurikuler berdasarkan sekolah, kelas, serta penugasan pengguna.
- Menampilkan ringkasan tugas tambahan pada Manajemen Pengguna tanpa menggabungkan atau mengubah akun secara otomatis.
- Menyeragamkan identitas dan teks lisensi installer menjadi Kaganga.

### Catatan pembaruan

- Cadangkan database sebelum memasang pembaruan.
- Installer tetap menggunakan port aplikasi `1206` dan lokasi data `%LOCALAPPDATA%\Kaganga-data`.
- Installer memakai `AppId` Kaganga yang sama sehingga pemasangan memperbarui versi sebelumnya tanpa membuat aplikasi baru.
- Kompatibilitas nama teknis lama tetap dipertahankan hanya untuk migrasi data dan pembaruan instalasi lama.

## 2.1.8 - 2026-09-15

### Perbaikan rilis

- Memperbaiki pipeline installer agar selalu membangun aplikasi dan membuat staging baru sebelum kompilasi.
- Memastikan seluruh fitur dan rute terbaru masuk ke paket Windows, termasuk RPM dan lampiran pembelajaran.
- Mencegah installer memakai staging lama yang hanya memiliki nomor versi terbaru.
- Mempertahankan mekanisme backup, migrasi aman, port `1206`, dan direktori data Kaganga yang sama.

## 2.1.7 - 2026-09-15

### Fitur dan perbaikan

- Menambahkan generator RPM dan lampiran pembelajaran berbantuan AI dengan pratinjau serta ekspor PDF.
- Menyusun ulang Cetak Dokumen dan Cetak Raport berdasarkan jenis sekolah, termasuk pratinjau Buku Tamu Digital.
- Menambahkan ringkasan absensi harian dan kelengkapan data pada dashboard.
- Memperkuat pembatasan menu, ekspor, dan data kelas berdasarkan peran serta penugasan pengguna.
- Merapikan Presensi Pegawai, jenis pegawai, dan ringkasan jumlah murid yang ditangani.
- Menyeragamkan nama berkas PDF berdasarkan dokumen, murid, kelas, dan tahun ajaran.
- Meningkatkan keamanan backup dan pemulihan SQLite, termasuk validasi database Kaganga dan rollback saat impor gagal.
- Menaikkan batas impor backup menjadi 512 MB untuk mendukung database sekolah yang berkembang.

### Catatan pembaruan

- Cadangkan database sebelum memasang pembaruan.
- Installer tetap menggunakan port aplikasi `1206` dan lokasi data `%LOCALAPPDATA%\Kaganga-data`.
- Installer memakai `AppId` Kaganga yang sama sehingga pemasangan memperbarui aplikasi sebelumnya.
- Migrasi dan pemulihan database tidak menghapus data sekolah yang sudah ada.

## 2.1.3 - 2026-09-06

### Fitur dan perbaikan

- Menyempurnakan formulir SPPD dan Dinas Luar serta merapikan pengelompokan menu Surat Menyurat.
- Memindahkan Buku Tamu ke Surat Menyurat dan Presensi Pegawai ke menu Absensi.
- Menambahkan pilihan latar dokumen pada Jurnal Mengajar serta dokumen Martikulasi.
- Menyempurnakan penilaian Martikulasi, termasuk input massal dan level penempatan Dasar, Madya, atau Mahir.
- Memperbarui pengelolaan mata pelajaran intrakurikuler, impor, ekspor, dan pembatasan akses berdasarkan penugasan.
- Merapikan halaman Pengaturan dan memperkuat manajemen pengguna, keamanan kata sandi, izin khusus, serta pemulihan akses.
- Menambahkan dukungan drag-and-drop sentuh pada Jadwal Pelajaran dan pengurutan mata pelajaran.
- Mempertahankan seluruh validasi kelas, jenjang, slot pelajaran, kegiatan non-JP, merge jadwal, dan target JP mingguan.

### Catatan pembaruan

- Cadangkan database sebelum memasang pembaruan.
- Installer tetap menggunakan port aplikasi `1206` dan lokasi data `%LOCALAPPDATA%\Kaganga-data`.
- Saat pertama dijalankan, Kaganga membuat backup database sebelum migrasi versi `2.1.3`.
- Migrasi bersifat idempoten dan tidak menghapus data sekolah, pengguna, pegawai, murid, nilai, atau jadwal yang sudah ada.
- Installer tetap memakai `AppId` Kaganga yang sama agar pemasangan memperbarui aplikasi sebelumnya.

## 2.1.0 - 2026-09-04

### Fitur dan perbaikan

- Menambahkan Buku Tamu digital dengan tautan tamu, tanda tangan, dan pemisahan data per sekolah.
- Menambahkan Presensi Pegawai beserta rekap dan dokumen cetaknya.
- Menambahkan sinkronisasi Dapodik yang tervalidasi serta dokumentasi penggunaan untuk Kaganga.
- Menambahkan bantuan AI opsional untuk menyusun Tujuan Pembelajaran tanpa mengubah data otomatis.
- Menyempurnakan Surat Menyurat, termasuk SPPD dan Dinas Luar, dengan penyimpanan lampiran yang aman.
- Menambahkan asesmen dan dokumen Martikulasi: SK Tim, Raport Hasil, serta STTM dengan snapshot dokumen.
- Menyeragamkan kop Jadwal Pelajaran, Kalender Pendidikan, Jurnal Mengajar, dan dokumen Martikulasi berdasarkan Data Sekolah.
- Menyempurnakan pengaturan presensi, rekap absensi, keamanan login, izin pengguna, bantuan kontekstual, dan tampilan menu.

### Catatan pembaruan

- Cadangkan database sebelum memasang pembaruan.
- Installer tetap menggunakan port aplikasi `1206` dan lokasi data `%LOCALAPPDATA%\Kaganga-data`.
- Saat pertama dijalankan, Kaganga membuat backup sebelum migrasi versi `2.1.0`.
- Migrasi tabel baru dijalankan secara idempoten dan tidak menghapus data sekolah yang sudah ada.
- Direktori lama `%LOCALAPPDATA%\Rapkumer-data` hanya digunakan sebagai sumber migrasi jika database Kaganga belum tersedia.

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
