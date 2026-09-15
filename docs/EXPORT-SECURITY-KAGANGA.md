# Keamanan backup dan ekspor Kaganga

## Aturan akses

- Backup seluruh database: admin atau akun legacy bertipe kepala_sekolah. Jabatan pegawai tidak otomatis mengubah role akun atau memberikan akses backup.
- Rekap absensi: admin, kepala_sekolah, wali kelas lama, atau akun dengan izin administrasi_absensi.
- Ekspor mata evaluasi keasramaan: admin, kepala_sekolah, wali kelas lama, wali asuh, wali asrama, atau akun dengan izin mata_pelajaran_keasramaan.
- Selain admin, akun harus terhubung ke sekolah aktif. Guru harus memiliki penugasan kelas; wali kelas lama mengikuti penugasan kelasnya; wali asuh/asrama mengikuti murid yang ditugaskan melalui nama wali sesuai mekanisme Kaganga saat ini.
- Kelas wajib berada di sekolah aktif, termasuk bagi admin. Izin fitur tidak memberikan akses semua kelas.
- Penugasan guru lintas semester mengikuti fallback nama kelas pada tahun ajaran yang sama, tidak otomatis diteruskan ke tahun berikutnya.

## Dampak

Tidak ada migrasi database, perubahan role, penghapusan data, atau rilis installer. Jika akun lama belum terhubung ke sekolah/pegawai/kelas, admin perlu melengkapi penugasan; sistem tidak menganggap cookie kelas sebagai bukti kewenangan.

## Pembatasan menu

- Data Sekolah dan Data Kelas ditutup secara bawaan untuk akun non-admin. Admin dapat memberi izin lihat atau kelola secara terpisah. Izin kelola lama tetap mencakup lihat.
- Guru tidak dapat membuka menu keasramaan secara bawaan. Admin dapat memberi izin lihat, kelola mata evaluasi/catatan, input nilai, atau ekspor secara terpisah, tetap dalam penugasan kelas.
- Wali kelas lama, wali asuh, dan wali asrama tetap memiliki akses keasramaan bawaan sesuai penugasan. Tidak ada penghapusan role lama.
- Perubahan ini membatasi Data Sekolah, Data Kelas, Mata Evaluasi Keasramaan, Input Nilai Keasramaan, Catatan Wali Asrama, dan Rekap Nilai Keasramaan beserta API terkait; tidak menimpa aturan modul akademik, absensi, atau cetak yang lain.
- Jumlah murid ditampilkan dalam pemilih kelas/nama akun dan daftar Manajemen Pengguna. Hitungan dibatasi sekolah, tahun ajaran, dan semester aktif, memakai query agregasi tanpa memuat foto/biodata.
- Nama wali yang ambigu dalam satu sekolah tidak dijadikan bukti penugasan. Ringkasan meminta admin memeriksa penugasan; akses anak berbasis nama tersebut ditolak sampai identitas diperjelas. Hubungan lama tidak dimigrasi otomatis.

## Pengujian

```powershell
node --test src/lib/menu-access.test.ts src/lib/export-access.test.ts src/lib/server/db/database-safety.test.ts src/lib/server/db/database-restore.test.ts
pnpm check
pnpm build
node scripts/test-export-security-copy.mjs
```

Pengujian endpoint membuat snapshot konsisten database pengembangan ke direktori sementara, membuat akun/sekolah/kelas uji hanya pada salinan, dan memakai port 5153 yang wajib kosong. Server uji otomatis dihentikan. Port 1206 tidak dioperasikan.
