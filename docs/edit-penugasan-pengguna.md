# Edit Penugasan Pengguna

Perubahan lokal setelah tahap akun massal, tanpa menaikkan versi atau memasang
ulang aplikasi PC sekolah.

## Pemakaian

1. Admin membuka Manajemen Pengguna > Aksi > Edit pengguna (ikon pensil).
2. Jabatan Akses dapat ditambah, diganti atau dihapus. Jabatan tidak mengubah
   role dasar dan tidak otomatis memberi akses Pengaturan atau Manajemen Pengguna.
3. Guru dan akun Wali Kelas lama dapat memilih beberapa mata pelajaran dan
   kelas mengajar dengan checkbox. Pilihan tidak dihapus saat jabatan berubah.
   Mapel bernama sama dikelompokkan tanpa menghilangkan ID penugasan sebelumnya.
4. Kelas menampilkan tahun ajaran dan semester agar kelas bernama sama dapat
   dibedakan. Penugasan sebagai wali kelas tetap mengikuti Data Kelas;
   menambah kelas mengajar tidak memindahkan wali kelas atau murid.
5. Kosongkan kata sandi baru untuk mempertahankan sandi lama. Simpan, kemudian
   pengguna login ulang dengan akun dan sandi yang sama untuk memakai akses baru.

Wali asuh/asrama tanpa Jabatan Akses tetap mengikuti anak binaan di data murid,
bukan seluruh kelas yang dipilih. Penugasan pengampu resmi, jadwal dan tanda
tangan mapel tetap diatur di Data Mata Pelajaran, bukan di form akses akun.

## Perlindungan

- Tidak menambah akun baru atau memindahkan tautan Data Pegawai.
- Hak khusus yang sudah diberikan admin dipertahankan jika role tidak berubah.
  Izin pemilih kelas ditambahkan untuk penugasan kelas eksplisit; kelas/anak
  di luar penugasan tidak otomatis terbuka.
- Perubahan disimpan bersama penugasan, pencabutan sesi dan audit dalam satu
  transaksi. Gagal audit membatalkan seluruh transaksi.
- Form usang atau perubahan bersamaan ditolak; muat ulang sebelum mencoba lagi.
- Pilihan jabatan/role tidak valid serta kelas/mapel sekolah lain ditolak.
- Sandinya tidak ditulis ke audit atau log error; sandi tetap bila kolom kosong.

Backup sebelum perubahan:
`data/database-backup-pre-edit-penugasan-pengguna-2026-10-04T03-31-23-765Z.sqlite3`
beserta manifest lampiran. Akun nyata tidak diedit untuk QA.

Pengujian: `node scripts/test-bulk-users-copy.mjs` memakai salinan database.
Meliputi popup desktop/HP, buka ulang, dua kelas/mapel, mapel bernama sama,
sandi dan izin tetap, peran lama, pencabutan jabatan, batas sekolah, form usang,
penolakan non-admin, rollback audit, pencabutan sesi, SQLite dan foreign key.
