# Akun Massal dan Penerapan: Tahap 11-20

Kandidat perubahan untuk Kaganga v2.2.2. Versi tidak dinaikkan, installer resmi
tidak dibuat, dan perubahan tidak dikirim ke GitHub atau PC sekolah dalam tahap ini.

## Membuat Akun

1. Login sebagai admin lalu buka Manajemen Pengguna > Buat Akun Massal.
2. Pilih Guru, Wali Asuh, atau Wali Asrama. Sistem memakai sekolah dan periode
   akademik aktif milik admin, bukan sekolah dari perangkat client.
3. Pilih pegawai aktif yang penugasannya lengkap. Pegawai guru harus memiliki
   mapel pada kelas periode aktif. Wali harus memiliki anak binaan aktif dengan
   nama wali yang sesuai data pegawai. Nama kosong/ganda atau penugasan kosong
   harus diperbaiki terlebih dahulu.
4. Periksa tugas rangkap secara khusus. Pengangkatan sebagai kepala sekolah,
   waka, atau operator tidak dilakukan oleh generator; Jabatan Akses diatur
   terpisah oleh admin.
5. Buka pratinjau username, role, kelas/mapel atau jumlah anak binaan, dan izin.
   Konfirmasi sebelum membuat maksimal 100 akun per transaksi.
6. Simpan daftar awal sekali dari hasil pembuatan dan bagikan secara pribadi.
   CSV ini berisi sandi sementara dan harus disimpan secara terbatas, bukan
   dikirim ke grup atau GitHub. Hapus salinan setelah semua sandi diganti.

Guru mendapat peran dasar Guru (`user`), termasuk kelas wali bila ditugaskan.
Wali asuh/asrama mengikuti penugasan anak, tidak mendapat seluruh murid kelas.
Izin dasar absensi tidak mengizinkan impor, pengaturan, reset QR, atau koreksi
tanggal lama; pengecualian harus diberikan admin tanpa memperluas cakupan anak.

## Perlindungan

- Akun terhubung yang sudah ada dilewati, termasuk akun di sekolah lain.
  Username, sandi, role, Jabatan Akses dan izin akun lama tidak diubah.
- Username unik diperiksa secara global. Sandi sementara acak dan berbeda,
  disimpan sebagai hash dengan salt, tidak dicatat dalam audit.
- Penugasan/username diperiksa ulang dalam transaksi. Pratinjau usang, pegawai
  di luar sekolah/role, pilihan tidak lengkap atau kegagalan audit membatalkan
  seluruh penambahan; tidak ada akun setengah jadi.
- Pengulangan dan permintaan bersamaan tidak membuat akun pegawai ganda.
- Hasil sandi tidak disimpan di browser storage atau endpoint unduh permanen.
  Setelah popup ditutup/reload, sandi tidak dapat diambil lagi. Jika respons
  terputus setelah transaksi tersimpan, admin harus memakai reset sandi akun
  yang ada, bukan membuat ulang atau mengharapkan sandi lama ditampilkan.
- Login pertama wajib mengganti sandi melalui popup yang sudah tersedia.
  Penggantian sandi mencabut sesi lama. Akun lama tidak dipaksa reset massal.
- CSV melindungi kolom identitas dari formula spreadsheet; sandi tetap rahasia.

## Pengujian Tahap 16-19

QA memakai salinan database dan akun buatan di `tmp`, bukan akun produksi.
Server QA tidak memakai port 5152/1206. Verifikasi lokal menggunakan 5152 saja.

```powershell
$tests = @(rg --files src -g '*.test.ts')
node --test @tests
pnpm check
pnpm build
node scripts/test-access-absensi-copy.mjs
node scripts/test-bulk-users-copy.mjs
node scripts/test-murid-identity-copy.mjs
```

Uji mencakup admin/Kepsek/Wakakur/guru/wali kelas/asuh/asrama; tombol dan URL
langsung; ID anak lain, QR dan permintaan campuran; ekspor sesuai binaan; akun
massal tiga role; duplikasi, tugas rangkap, perubahan pratinjau, transaksi audit,
permintaan bersamaan; login/ganti sandi pertama; desktop/HP; SQLite/foreign key.
Hasil dan screenshot disimpan pada folder QA masing-masing. File hasil QA
tidak menyimpan sandi sementara. Salinan database QA tetap harus diperlakukan
sebagai data pribadi karena berasal dari database lokal.

Hasil verifikasi lokal 4 Oktober 2026:

- 155/155 pengujian unit lulus; lint modul baru lulus.
- `pnpm check`: 0 error, 115 peringatan yang sudah ada; build produksi lulus.
- QA final: `tmp/bulk-users-qa-dhGptR`, `tmp/access-absensi-qa-gIcGdG`, dan
  `tmp/murid-identity-qa-P5hkU2`, semuanya lulus pada salinan database.
- SQLite lokal `quick_check=ok`, tanpa pelanggaran foreign key; 92 murid,
  14 akun tidak berubah dari backup awal tahap 11, tanpa akun QA di database lokal.
- Screenshot desktop/HP pratinjau dan hasil akun massal telah diperiksa.

Backup lokal sebelum tahap 11:
`data/database-backup-pre-akun-massal-2026-10-04T02-21-39-849Z.sqlite3`
beserta manifest lampirannya. Ini bukan backup PC sekolah.

## Paket Kandidat Tahap 20

`node scripts/prepare-access-update.mjs` menyiapkan folder kandidat baru di
`dist/windows/candidates` dari build yang sudah diuji, dokumentasi dan manifest
SHA-256. Paket tidak memuat database, berkas murid, sandi, `.env`, atau data QA.
Paket memuat juga perbaikan NISN/identitas yang sudah ada di working tree.
Runtime dan dependensi harus tetap cocok dengan versi dasar; paket ini bukan
installer atau updater otomatis, tidak boleh menimpa folder aplikasi aktif.

Sebelum rilis/instalasi resmi, setelah persetujuan terpisah:

1. Backup database dan seluruh lampiran PC sekolah; verifikasi pemulihannya.
2. Pastikan hanya satu server produksi; catat lokasi data, versi dan domain.
3. Buat installer resmi dari kandidat teruji dan uji update pada salinan
   instalasi sekolah. Jangan menyalin database laptop pengembang ke sekolah.
4. Jadwalkan penghentian server, instal pembaruan, lalu periksa jumlah murid,
   sekolah aktif, penugasan dan akun yang sudah ada tanpa reset.
5. Uji perangkat client dengan akun Kepsek/Wakakur/guru/wali, termasuk tambah
   murid, pembatasan anak binaan, absensi dan ganti sandi akun baru.
6. Baru lakukan uji coba massal; simpan paket sebelumnya dan backup untuk
   pemulihan terkontrol bila ditemukan masalah.

Pengujian client PC sekolah dan pemasangan produksi belum dianggap selesai
hanya karena QA lokal lulus.
