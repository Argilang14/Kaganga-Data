# Akses pengguna dan penugasan

## Matriks role

| Role            | Kewenangan                                                                                                                                           |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Admin           | Seluruh sistem dan manajemen pengguna.                                                                                                               |
| Kepala Sekolah  | Seluruh sistem, perubahan operasional, dan manajemen pengguna.                                                                                       |
| Wakakur         | Kurikulum, mapel, jadwal, kalender, ujian, Martikulasi, RPM, koreksi seluruh nilai akademik dan keasramaan.                                          |
| Waka Kesiswaan  | Data/status murid, mutasi, penempatan kelas, absensi, izin pulang, dan tindak lanjut.                                                                |
| Waka Sarpras    | Inventaris, ruangan, peminjaman, dan perawatan.                                                                                                      |
| Waka Keasramaan | Asrama, penempatan, penugasan, mata evaluasi, catatan, dan pemantauan hasil; pengisian nilai memerlukan role penilai.                                |
| Waka Humas      | Surat, komunikasi, pengumuman, berkas, dan absensi penuh.                                                                                            |
| Operator        | Seluruh operasional sekolah, termasuk penempatan dan koreksi nilai; tanpa manajemen pengguna dan pemeliharaan sistem.                                |
| Guru Mapel      | Mapel dan jurnal sesuai mata pelajaran serta kelas mengajar; absensi sesuai penugasan.                                                               |
| Wali Kelas      | Hak tambahan otomatis dari Data Kelas aktif: seluruh nilai mapel kelas binaan, murid kelas, penempatan murid pasif, catatan, dan administrasi rapor. |
| Wali Asrama     | Penghuni, mata evaluasi, catatan, dan rekap asrama binaan; pengisian nilai memerlukan role Wali Asuh.                                                |
| Wali Asuh       | Seluruh mata evaluasi anak binaan sesuai ID pegawai dan penempatan asrama, termasuk anak tanpa kelas.                                                |
| Tim Dapur       | Absensi dan rekap kegiatan makan.                                                                                                                    |
| Tim Keamanan    | Konfirmasi kepulangan dan kembali ke sekolah.                                                                                                        |
| Wali Murid      | Portal anak yang ditautkan.                                                                                                                          |

## Akun dan migrasi

- Satu pegawai memakai satu akun dengan beberapa role. Akun dibuat manual atau melalui pratinjau pembuatan massal. Penunjukan wali kelas tidak membuat akun baru.
- Pilihan, filter, dan kolom Jabatan Akses dihapus. Role pimpinan/operator tersedia langsung pada pilihan role. Kolom lama dipertahankan untuk kompatibilitas instalasi, lalu dikosongkan saat migrasi.
- Migrasi mengisi JSON auth_user.roles dari tipe akun dan Jabatan Akses lama. Role Guru Mapel dipertahankan bagi pimpinan yang memiliki penugasan mengajar atau wali kelas.
- Migrasi otomatis, transaksional, dan dapat diulang. Role tak dikenal menghentikan migrasi. Backup dibuat sebelum perubahan pertama.
- Backup lokal sebelum migrasi: data/database-backup-roles-pengguna-2026-11-03T17-09-12-058Z.sqlite3.
- Perbandingan backup dengan database lokal memastikan 40 akun dan kredensial, 182 penugasan kelas, 58 penugasan mapel, 20 kelas, 501 murid, dan 3.003 nilai sumatif tetap sama.
- Pegawai nonaktif atau hubungan pegawai/sekolah tidak valid ditolak saat autentikasi. Perubahan role dan penonaktifan mencabut sesi; aktivasi kembali tetap memerlukan login baru.

## Batas penugasan

- Wali kelas dibaca dari Data Kelas pada semester dan tahun ajaran aktif. Semua mapel kelas binaan terbuka. Kelas lain hanya membuka mapel dan kelas mengajar yang ditugaskan. Berakhirnya penugasan wali menghapus hak seluruh mapel kelas lama, dengan riwayat tetap tersimpan.
- Pilihan mapel dan kelas mengajar merupakan dua daftar pada akun. Nama mapel terpilih berlaku pada kelas mengajar terpilih; nama sama tidak membuka kelas yang tidak ditugaskan.
- Guru dengan tambahan role Sarpras tidak memperoleh akses nilai/absensi seluruh sekolah. Role guru dan wali dapat digabung; kelas anak binaan muncul pada absensi, tetapi murid lain di kelas tersebut tetap tertutup.
- Wali Asuh yang sekaligus Waka Keasramaan tetap hanya mengisi nilai anak binaannya. Role Wakakur, Operator, atau akses penuh memiliki kewenangan koreksi seluruh nilai.
- Gabungan role Tim Dapur dan guru membuka murid lintas kelas untuk kegiatan makan. Kegiatan sekolah tetap mengikuti kelas guru, termasuk pemeriksaan server saat simpan, pindai, dan impor.
- Absensi seluruh sekolah tersedia bagi Admin, Kepala Sekolah, Operator, Waka Kesiswaan, dan Waka Humas. Petugas lain mengikuti penugasan serta kategori kegiatan. Penugasan piket tidak membuka akses seluruh sekolah.
- Pengamanan mencakup menu, pemuatan langsung, penyimpanan, ekspor, dan impor. Izin tersimpan lama disaring menurut batas role; centang izin lama tidak membuka bidang lain atau manajemen pengguna.

## UI dipertahankan

Susunan halaman, pola tabel, ukuran modal, dan komponen sebelumnya tetap digunakan. Perubahan terbatas pada pilihan beberapa role serta penghapusan Jabatan Akses.

| Komponen        | Acuan lokal                                                                      | Ukuran/pola yang dipertahankan                                     | Keyakinan            |
| --------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------ | -------------------- |
| Tabel izin      | `src/routes/pengguna/[id]/+page.svelte`; halaman setara pada checkout `rapkumer` | `table w-full`, `toggle toggle-sm toggle-primary`, kolom label 90% | Sumber terverifikasi |
| Pembungkus izin | Halaman izin Kaganga                                                             | `p-4 sm:p-6`, `rounded-lg`, `overflow-x-auto`                      | Fallback Kaganga     |
| Modal akun      | `src/lib/components/pengguna/AddUserModal.svelte`                                | `w-[min(94vw,52rem)]`, `max-h-[92vh]`, `p-4 sm:p-6`                | Fallback Kaganga     |

## Pemeriksaan

Jalankan dari akar repositori:

```powershell
node --test src/lib/user-role.test.ts src/lib/access-position.test.ts src/lib/attendance-access.test.ts src/lib/attendance-scan.test.ts src/lib/class-monitoring.test.ts src/lib/menu-access.test.ts src/lib/role-menu-access.test.ts src/routes/pengguna/permissions.test.ts src/lib/bulk-user.test.ts src/lib/murid-permissions.test.ts src/lib/dormitory.test.ts src/lib/export-access.test.ts
node scripts/test-user-roles-copy.mjs
node scripts/test-dorm-evaluation-copy.mjs
pnpm check
pnpm build
```

Skrip integrasi membuat salinan SQLite di tmp/. Kredensial sintetis, pembuatan akun, perubahan penugasan, dan nilai uji hanya tersimpan pada salinan. Pengujian migrasi merekonstruksi struktur lama pada salinan sebelum menjalankan migrasi dua kali.

Hasil 4 November 2026: 80 tes aturan akses, 14 kelompok integrasi akun/kelas, dan 16 kelompok integrasi keasramaan lulus. Pemeriksaan tipe: 0 galat dan 119 peringatan. ESLint pada berkas cakupan role lulus. Lint seluruh src masih memuat galat di modul lain. Build produksi akhir berhasil, termasuk pembatasan akun gabungan Tim Dapur.

Tampilan diperiksa melalui akun admin sintetis pada server lokal 5174 dengan database salinan: pilihan dua role bekerja, Jabatan Akses hilang, serta tabel dan modal memakai susunan sebelumnya. Akun pada database operasional tidak diubah selama uji browser. Bukti tampilan: tmp/user-roles-pzcZ2F/manajemen-pengguna.jpg.
