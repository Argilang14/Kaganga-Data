# Riwayat Pendidikan: Tahap 5-8

## Ruang Lingkup

- Arsip Murid & Alumni > Riwayat Pendidikan menampilkan tabel tahun ajaran, semester,
  kelas, serta tautan pemeriksaan rapor sekolah dan asrama.
- Rapor sekolah menyediakan RTS/RAS; rapor asrama memakai akhir semester.
- Setiap dokumen mengambil baris murid sumber pada riwayat tersebut. UID, sekolah,
  kelas, semester, tahun ajaran, relasi mapel/tujuan dan sumber narasi diperiksa.
- Semester aktif global tidak diganti. Snapshot lama tanpa murid sumber tidak
  dipasangkan secara perkiraan melalui NIS atau NISN.
- Nilai kosong tidak dianggap nol. Tanpa penilaian, halaman menampilkan keadaan
  kosong, bukan membuat rapor final dari data yang tidak tersedia.

## Pemeriksaan Dan Finalisasi

1. Buka rapor dari baris riwayat yang ingin diperiksa.
2. Periksa nama sekolah, NPSN 8 digit, alamat, penandatangan, status kepala sekolah,
   tempat dan tanggal rapor sesuai periode. Nama/NIP Wali Asuh juga tersedia untuk
   rapor asrama. Referensi awal bukan jaminan metadata historis benar.
3. Konfirmasikan metadata dan buat pratinjau PDF. Tersedia pembuka tab baru dan
   unduhan draf untuk browser yang tidak mendukung PDF tertanam.
4. Admin memeriksa PDF, menyetujui finalisasi, lalu menyimpan rapor final.

Finalisasi membutuhkan nilai inti lengkap, kecocokan baris rapor sekolah dengan
cakupan kelas, serta sumber narasi yang dapat ditampilkan. Mapel agama/kitab suci
disesuaikan dengan agama murid memakai aturan yang sama seperti pencetakan rapor.
Perhitungan mapel pilihan masih konservatif terhadap mapel kelas; jangan
mengisi nilai fiktif untuk melewati pengaman.

Hash sumber pratinjau harus sesuai pada saat finalisasi dan diperiksa ulang setelah
PDF dibuat. Satu riwayat/jenis/periode hanya mempunyai satu arsip final.

## Penyimpanan Dan Keamanan

- SQLite menyimpan `rapor_arsip`: metadata/snapshot data, UID, sumber riwayat,
  pembuat, waktu, SHA-256 dan lokasi PDF. Gambar base64 tidak diduplikasi di SQLite;
  aset asli tertanam dalam PDF final dan snapshot mencatat hash aset tersebut.
- Berkas disimpan pada `uploadsDir()/rapor-arsip/sekolah-<id>/<uuid>.pdf`, di luar
  SQLite. Dokumen tidak berada pada direktori publik.
- Unduhan/pratinjau final memerlukan login, sekolah yang sesuai, izin arsip murid,
  dan izin cetak akademik/keasramaan. Finalisasi tahap ini khusus admin.
- API tidak memberikan akses melalui nama file bebas. Ukuran permintaan dibatasi
  16 KiB dan pekerjaan bersamaan per akun ditolak.
- PDF final dibaca apa adanya, bukan dibuat ulang. Ukuran dan hash diperiksa sebelum
  dikirim; berkas hilang/rusak ditolak dengan pesan pemulihan.
- Indeks unik dan trigger melindungi isi arsip dari penimpaan. Foreign key RESTRICT
  mencegah penghapusan permanen murid/riwayat yang masih memiliki rapor final.
  Alur penghapusan murid yang sudah ada juga mendeteksi relasi ini sebagai penghalang.
- Penyimpanan final dan catatan audit berada dalam transaksi; file baru dibersihkan
  bila transaksi gagal. Tidak tersedia endpoint hapus atau timpa arsip final.

## Backup

Backup harus mencakup SQLite **dan seluruh folder unggahan**. Alat tahap 1-4
`scripts/audit-report-history-copy.mjs` kini memeriksa referensi PDF final, ukuran,
dan SHA-256. Pemulihan diuji ke folder QA baru, bukan ke database operasional.

Backup otomatis lama yang hanya menyalin database belum cukup untuk PDF final.
Jangan menghapus folder `rapor-arsip` saat memindahkan server atau memperbarui aplikasi.

## Acuan UI

Fallback Kaganga dari popup Arsip yang sudah ada, bukan ukuran Rapkumer yang
diklaim telah diukur langsung: modal maksimal 672px, padding 16px, tabel minimal
560px dengan gulir lokal, input 40px, judul 20px. Ruang pemeriksaan memakai dua
kolom pada layar lebar dan menumpuk pada layar kecil. Tidak ada CSS global baru.

## Verifikasi

- `src/lib/report-archive.test.ts`: validasi pilihan, metadata, NPSN/NIP, tanggal.
- `scripts/test-report-archive-copy.mjs`: database salinan; nilai kosong/tidak lengkap,
  akses sekolah, periode/relasi narasi salah, konfirmasi metadata, hash usang,
  finalisasi sekolah/asrama, trigger, FK, audit, integritas PDF, backup/pemulihan.
- `scripts/test-report-archive-ui-copy.mjs`: server QA terpisah pada 5192;
  lebar 360/390/768/1024/1440px, popup, pratinjau PDF, persetujuan final, unduhan
  terlindungi dan galat runtime browser. Nilai/finalisasi contoh hanya di salinan.
- PDF sekolah/asrama contoh dirender melalui Poppler untuk pemeriksaan visual.

Hasil pemeriksaan 31 Oktober 2026: build berhasil; 363 tes unit lulus; tujuh
kelompok pengujian database salinan dan lima kelompok uji browser lulus.
Svelte check: 0 galat, 116 peringatan proyek yang sudah ada. ESLint file fitur
lulus; pemeriksaan format difokuskan pada berkas baru agar tidak memformat ulang
halaman/schema lama secara menyeluruh. Server lokal dimuat ulang pada port 5152
dan `/login` merespons HTTP 200; layanan 1206 tidak dimuat ulang.

Backup pra-aktivasi tersimpan di
`dist/backups/report-history/audit-2026-10-31T03-46-09-239Z`: integritas SQLite baik,
referensi unggahan lengkap terhadap pemeriksaan alat, dan salinan pemulihan sesuai.

Data lokal saat audit hanya memiliki periode 2026/2027 ganjil dan belum mempunyai
nilai sumatif/asrama. Tidak ada nilai historis yang diciptakan atau rapor final
operasional yang disimpan otomatis. PC sekolah belum diaudit melalui jaringan.

## Kelanjutan

Tahap 9-12 dilanjutkan pada [catatan tahap 9-12](report-history-phase9-12.md):
revisi arsip final, matriks akses/penugasan, finalisasi massal dan pengujian lanjutan.
Kebijakan awal admin-saja pada dokumen ini kini mendukung delegasi persetujuan eksplisit.
Pemetaan mapel pilihan yang berlaku per murid masih perlu disempurnakan sebelum finalisasi
massal. Modul master asrama dan redesign jabatan akses tidak diubah pada tahap ini.
