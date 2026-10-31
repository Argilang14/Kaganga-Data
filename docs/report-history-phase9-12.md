# Riwayat rapor: tahap 9-12

## 9. Revisi dengan versi baru

Arsip awal tetap berada di `rapor_arsip`. Revisi ditambahkan ke
`rapor_arsip_revisi` dengan nomor versi, versi sebelumnya, alasan, snapshot data,
SHA-256 PDF, pembuat, dan waktu. PDF lama tidak diubah atau dihapus.

- Alasan revisi wajib 10-1000 karakter.
- Metadata dan PDF diperiksa kembali; hash pratinjau harus cocok saat disetujui.
- Versi sebelumnya harus masih merupakan versi terbaru. Dua persetujuan bersamaan
  tidak dapat menerbitkan nomor versi yang sama.
- Pembacaan final menggunakan snapshot dan PDF tersimpan, tidak menghitung ulang
  nilai dari data yang sedang diedit. Sumber identitas dan cakupan akses tetap diperiksa.
- Pemilih versi menyediakan PDF awal dan seluruh revisi. Versi terbaru menjadi
  pilihan awal. Ukuran/hash setiap berkas diperiksa sebelum dikirim.

Tidak ada API untuk menimpa/menghapus versi final. Koreksi nilai sumber tetap
melalui menu penilaian; fitur revisi menerbitkan dokumen dari sumber yang telah diperiksa.

## 10. Akses sesuai izin dan penugasan

Menu **Informasi Umum > Riwayat Rapor** memakai ruang baca tersendiri agar izin
melihat rapor tidak membuka tindakan keluar sekolah, kenaikan kelas, atau hapus murid.
Halaman menggunakan periode yang dipilih tanpa mengganti semester/kelas aktif global.

Izin baru pada Manajemen Pengguna:

- `rapor_arsip_lihat`: membaca riwayat, tetap memerlukan izin cetak jenis rapor.
- `rapor_arsip_finalisasi`: menyetujui penyimpanan final.
- `rapor_arsip_revisi`: menerbitkan revisi, juga memerlukan izin finalisasi.
- `rapor_arsip_massal`: pratinjau massal, juga memerlukan izin finalisasi.

Admin memperoleh izin persetujuan. Akun lain memerlukan delegasi eksplisit;
bundel jabatan tidak otomatis memberikan tiga izin persetujuan baru tersebut.
Izin `murid_arsip` lama tetap dikenali untuk akses baca agar akun lama kompatibel.

| Akun                                                       | Cakupan baca                                                        | Persetujuan                                  |
| ---------------------------------------------------------- | ------------------------------------------------------------------- | -------------------------------------------- |
| Admin                                                      | Sekolah yang dipilih                                                | Seluruh tindakan                             |
| Kepsek/Waka/Operator dengan jabatan akses sah              | Cakupan sekolah, sesuai izin jenis rapor                            | Delegasi eksplisit                           |
| Guru/Wali Kelas                                            | Kelas yang ditugaskan, termasuk periode historis yang dapat diakses | Delegasi eksplisit, tidak memperluas cakupan |
| Wali Asuh/Wali Asrama                                      | Murid binaan pada kelas/periode yang dapat diakses                  | Delegasi eksplisit, tidak memperluas cakupan |
| Tim dapur/keamanan/wali murid tanpa jabatan yang berwenang | Ditolak                                                             | Ditolak                                      |

Jabatan akses sah tetap dapat memberi cakupan lebih luas daripada role dasar.
Pengecualian Wali Asrama yang dapat mengabsen seluruh murid **tidak** dipakai untuk
arsip rapor. Penugasan nama wali ambigu atau kosong tidak ditebak. Data sekolah
lain ditolak meskipun ID riwayat atau versi diketahui.

Pemeriksaan role baca-saja pada layout dikecualikan hanya untuk ruang riwayat rapor
ini: backend tetap menentukan akses serta persetujuan setiap tindakan. Modul lain
tidak dilonggarkan. Pengelolaan lifecycle di Arsip Murid tetap untuk akun dengan
cakupan operasional sekolah; akun terbatas diarahkan ke ruang baca rapor.

## 11. Finalisasi massal terkontrol

- Satu kelas, satu semester, satu jenis/periode rapor; maksimal 20 murid per proses.
  Tabel dipaginasi 20 baris. Proses kelas lebih besar diteruskan pada halaman berikutnya.
- Hanya riwayat konsisten, nilai inti lengkap, dan belum final yang dapat dipilih.
- Identitas, penandatangan dan tanggal berlaku bagi semua murid terpilih. Kelompok
  asrama dengan Wali Asuh berbeda harus dipisah; bukan diseragamkan otomatis.
- PDF gabungan dibuat berurutan dengan batas total 25 MiB. Pratinjau tidak menulis
  arsip final. Capaian/narasi yang tidak dapat ditampilkan memblokir finalisasi.
- Setelah persetujuan PDF, setiap murid disimpan melalui validasi dan transaksi
  individual. Ada kemajuan dan hasil berhasil/gagal per murid.
- Tombol berhenti mencegah dokumen berikutnya diproses. Dokumen yang sudah berhasil
  tetap tersimpan. Kelompok ini bukan transaksi seluruh kelas sekaligus.
- Bila nilai berubah, murid terkait ditolak dengan konflik. Pilih kembali hanya
  murid yang belum final dan buat pratinjau baru. Memuat ulang halaman tidak menimpa
  dokumen yang sudah final. Penutupan browser dapat meninggalkan dokumen terakhir
  yang telah disetujui tetap selesai di server; periksa status sebelum mengulang.

Mapel agama mengikuti aturan cetak yang ada. Mapel pilihan masih diperiksa secara
konservatif terhadap kelas; jangan mengisi nilai fiktif untuk meloloskan proses.
Nilai inti lengkap tidak menjamin seluruh catatan, presensi dan identitas historis
lengkap: persetujuan PDF tetap memerlukan pemeriksaan operator.

## 12. Backup, pengujian dan persiapan pembaruan

Alat backup memeriksa `rapor_arsip` dan `rapor_arsip_revisi`, termasuk file, ukuran,
hash dan ID versi teks. Snapshot SQLite saja tidak cukup; folder unggahan juga
harus disalin. Backup otomatis lama yang hanya memuat SQLite belum diganti oleh
pekerjaan ini. Gunakan alat backup lengkap sebelum aktivasi atau perpindahan server.

```powershell
node scripts/audit-report-history-copy.mjs --database data/database.sqlite3 --uploads data/uploads --uploads "$env:LOCALAPPDATA\Kaganga-data\uploads"
node scripts/test-report-archive-copy.mjs
node scripts/test-report-archive-ui-copy.mjs
node scripts/test-report-archive-upgrade-copy.mjs
```

Semua skrip uji memakai salinan di `tmp`, akun sementara dan port QA 5192. Foto
yang diperlukan disalin ke folder uji; tidak mengubah nilai, akun atau PDF operasional.
Simulasi skema v1 ke v2 hanya mengubah salinan sekali pakai. Baris arsip awal dan
hash PDF harus tetap sama; ensure schema berulang harus aman. Ini bukan pengujian
menjalankan installer Windows pada PC sekolah.

Pengujian mencakup nilai nol/kosong/tidak lengkap, sumber periode salah, UID,
matriks akses backend dan HTTP, persetujuan eksplisit, versi usang, dua penerbit
bersamaan, PDF rusak, kegagalan sementara UI, submit ganda, finalisasi parsial dan
pengulangan, serta backup/pemulihan semua versi setelah finalisasi melalui browser.
Tidak ada penilaian operasional yang dibuat otomatis pada data lokal yang kosong.

### Acuan ukuran UI

| Komponen              | Ukuran/pola                                                           | Sumber/keyakinan                                           |
| --------------------- | --------------------------------------------------------------------- | ---------------------------------------------------------- |
| Halaman pemeriksaan   | Padding 16px, judul 20px, form maksimal 440px, PDF mengisi sisa lebar | Fallback Kaganga, halaman tahap 5-8                        |
| Form metadata bersama | Kontrol 40px, label terlihat, satu/dua kolom sesuai ruang             | Fallback Kaganga, komponen `report-metadata-fields.svelte` |
| Tabel daftar          | Minimal 680px, gulir pada tabel, 20 baris/halaman                     | Fallback Kaganga; tidak mengubah shell/sidebar             |
| Tabel versi           | Minimal 560px, alasan membungkus baris                                | Fallback Kaganga, popup arsip yang sudah ada               |
| Responsif             | 360/390/768/1024/1440px, mode gelap dan fokus keyboard                | Diperiksa melalui skrip browser dan screenshot             |

Ukuran ini tidak diklaim sebagai pengukuran langsung Rapkumer terbaru. Tidak ada
framework/dependency/CSS global baru. Header, sidebar dan pola form/tabel memakai
pondasi aplikasi yang sudah ada.

Pengukuran runtime Kaganga pada viewport 1440px: lebar tabel 1071px, header 39,5px,
baris pertama 49px, dan select 40px. Baris dengan hasil/alasan panjang dapat bertambah
tinggi; gulir tabel tetap lokal pada HP.

### Hasil lokal 31 Oktober 2026

- Build berhasil; 366 tes unit lulus.
- Svelte check: 0 galat, 116 peringatan proyek yang sudah ada. ESLint file fitur lulus.
- Sebelas kelompok uji database salinan lulus, termasuk dua persetujuan revisi
  bersamaan: tepat satu versi diterbitkan dan proses lain menerima konflik 409.
- Sepuluh kelompok uji browser lulus, termasuk role, revisi v3, finalisasi massal,
  kegagalan sementara, submit ganda, mode gelap, fokus dan halaman kontrol jurnal.
- Backup setelah pengujian browser lengkap terhadap referensi file dan berhasil
  dipulihkan ke folder baru, mencakup foto, PDF awal, revisi dan finalisasi massal.
- Simulasi skema v1 ke v2 lulus: baris awal tetap sama, hash PDF sesuai, pemanggilan
  ensure berulang aman, integrity/FK check baik. Installer Windows belum dijalankan.
- Backup sebelum pekerjaan:
  `dist/backups/report-history/audit-2026-10-31T04-12-02-276Z`.

Hasil hanya untuk laptop lokal dan salinan uji. Data serta penugasan PC sekolah,
installer dan publikasi GitHub belum dikerjakan pada tahapan ini. Master Data Asrama
tetap merupakan pengembangan terpisah.

### Sebelum rilis ke PC sekolah

1. Hentikan sementara input/finalisasi; buat backup lengkap SQLite dan seluruh
   root unggahan. Pastikan manifest lengkap dan uji pemulihan ke folder baru.
2. Uji salinan database PC sekolah untuk penugasan guru/wali, metadata tiga NPSN,
   nilai rapor nyata, pilihan mapel dan dokumen yang sudah pernah ditandatangani.
3. Verifikasi Kepsek/Waka/Operator; delegasikan izin persetujuan hanya kepada akun
   yang ditetapkan sekolah. Uji akun terbatas dan unduhan lintas sekolah.
4. Jalankan build/check/tes, simulasi pembaruan installer dari versi yang sedang
   digunakan sekolah, lalu periksa ulang PDF lama dengan SHA-256.
5. Baru siapkan versi, installer, manifest pembaruan dan rilis GitHub bila diminta.
   Jangan mengganti database installer bersih dengan database operasional.

Rollback harus memperhitungkan PDF/versi yang dibuat setelah backup. Jangan
mengembalikan SQLite lama sendirian sehingga referensi file final hilang. Salin
kondisi terakhir sebelum pemulihan dan simpan seluruh unggahan; pemulihan produksi
memerlukan persetujuan dan pemeriksaan operator.
