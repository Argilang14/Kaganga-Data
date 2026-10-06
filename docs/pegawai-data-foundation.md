# Fondasi Data Pegawai

Dokumen ini mencatat hasil audit sebelum perluasan profil pegawai.

## Sumber data

- `pegawai` menyimpan biodata pegawai dan tidak membuat akun aplikasi.
- `auth_user.pegawai_id` hanya menghubungkan akun dengan pegawai.
- `kelas.wali_kelas_id`, `kelas.wali_asrama_id`, dan `kelas.wali_asuh_id` masih menjadi relasi lama yang dipertahankan.
- `sekolah.kepala_sekolah_id` tetap menjadi sumber kepala sekolah aktif.
- `jadwal_mapel.guru_pegawai_id` dan `jadwal_pelajaran.guru_pegawai_id` tetap menjadi sumber guru pada jadwal.

## Struktur tambahan

- `pegawai_penugasan`: riwayat jabatan dan penugasan berdasarkan tahun ajaran.
- `pegawai_pendidikan`: pendidikan formal pegawai.
- `pegawai_sertifikasi`: sertifikasi, pelatihan, dan diklat.
- `pegawai_dokumen`: metadata berkas; isi berkas tidak disimpan di Excel.
- `pegawai_riwayat`: audit perubahan biodata dan data turunannya.

## Aturan kompatibilitas

- Migrasi hanya menambah kolom, tabel, dan indeks.
- Kolom dan relasi lama tidak dihapus atau diganti.
- Pegawai lama memperoleh kode stabil `AUTO-PGW-########` berdasarkan ID lama.
- Migrasi tidak membuat, mengubah, atau menghapus `auth_user`.
- Semua tabel turunan membawa `sekolah_id` untuk mencegah akses lintas sekolah.
- Pengisian tabel penugasan baru akan dilakukan pada tahap formulir; relasi lama tetap menjadi sumber aktif sampai proses sinkronisasi dirancang dan diuji.

## Penghapusan aman

Pegawai yang masih digunakan sekolah, kelas, akun, atau jadwal tidak boleh dihapus permanen. Pegawai tersebut dinonaktifkan agar riwayat dan dokumen tetap tersedia.
