# Profil pegawai mandiri

Pegawai membuka **Pengaturan > Profil Pegawai > Buka Profil** menggunakan akun yang sudah ditautkan ke Data Pegawai. Admin menautkan akun melalui Manajemen Pengguna; profil tidak dibuat otomatis dari nama pengguna.

- **Biodata:** identitas, NIP/NIK/NUPTK/nomor PPPK, tempat/tanggal lahir, alamat, kontak, kontak darurat, data kepegawaian dan SK.
- **Pendidikan:** tambah, ubah, hapus riwayat pendidikan dan tandai pendidikan terakhir.
- **Sertifikasi:** tambah, ubah, hapus sertifikasi/pelatihan dan tanggal berlakunya.
- **Berkas:** unggah, ganti, buka dan hapus dokumen milik sendiri. PDF/JPG/PNG, maksimal 2 MB per berkas.
- **Foto:** JPG/PNG, maksimal 500 KB, memakai penyimpanan foto dan thumbnail yang sudah ada.

Data ini memakai record Data Pegawai yang sama, bukan salinan terpisah. Status aktif/nonaktif, jenis pegawai, jabatan, penugasan dan hak akses tetap dikelola admin. Status kepegawaian pada biodata (misalnya PPPK) tidak mengubah hak akses akun.

Server menentukan pegawai dari akun yang sedang masuk dan sekolah aktif. ID pegawai/sekolah dari formulir tidak diterima. Pendidikan, sertifikasi, dokumen dan foto dibatasi pada pemiliknya; pengelola sekolah tetap mengikuti izin pengelolaan yang sudah ada. Dokumen disimpan di luar SQLite. Perubahan biodata memakai pemeriksaan versi agar pembaruan bersamaan tidak menimpa data tanpa peringatan.
