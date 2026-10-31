# Riwayat pendidikan dan rapor: tahap 1-4

## Batas pekerjaan

Tahap ini menyiapkan audit baca-saja, backup SQLite bersama berkas unggahan, identitas lintas periode berdasarkan UID, serta peta ketersediaan nilai. Tidak ada perubahan UI, endpoint, izin pengguna, migrasi database, perbaikan identitas otomatis, penguncian rapor, atau penerbitan PDF final. Perubahan impor CSV pegawai yang sudah ada tetap dipertahankan.

## Pemetaan sumber

| Bagian                 | Sumber                                                                          | Pemeriksaan                                                                                                                |
| ---------------------- | ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Identitas orang        | `murid_identity_link`                                                           | UID per sekolah; satu baris murid per semester; konsistensi nama/NIS/tanggal lahir memakai helper identitas yang sudah ada |
| Data murid per periode | `murid`                                                                         | Referensi kelas, semester, tahun ajaran, dan sekolah cocok                                                                 |
| Riwayat pendidikan     | `murid_riwayat_kelas`                                                           | ID sumber dan kunci UID cocok; snapshot tanpa murid tidak dipasangkan ke orang lain                                        |
| Status murid           | `murid_lifecycle`                                                               | Status menunggu pemeriksaan UID menghalangi konteks historis; kunci lama tetap dilaporkan terpisah                         |
| Nilai sekolah          | `mata_pelajaran`, `asesmen_sumatif`                                             | Nilai akhir RTS/RAS hanya untuk murid dan kelas pada periode sumber; nol dianggap nilai sah                                |
| Nilai asrama           | `keasramaan`, `keasramaan_indikator`, `keasramaan_tujuan`, `asesmen_keasramaan` | Tujuan dan mata evaluasi berasal dari kelas yang benar; predikat valid; target ganda ditandai                              |
| Komponen pendukung     | Nilai kokurikuler/ekstrakurikuler, catatan wali, kehadiran                      | Dicatat keberadaannya, bukan dianggap lengkap otomatis                                                                     |

Nilai di luar kelas, relasi rusak, UID ganda satu semester, perubahan data pribadi dalam satu UID, dan NISN valid yang dipakai identitas berbeda harus diperiksa. Tidak ada pencocokan atau penggabungan otomatis melalui NIS/NISN. NISN kosong/tidak valid ditandai sebagai peringatan, tetapi tidak membatalkan UID yang sudah konsisten.

## Status kelengkapan

- `data_tidak_tersedia`: belum ada penilaian yang dapat dipakai dari periode sumber.
- `nilai_belum_lengkap`: sebagian target belum memiliki nilai/predikat valid.
- `nilai_inti_lengkap`: seluruh mapel kelas atau tujuan asrama memiliki nilai inti valid. Ini **bukan** status rapor final.
- `safeHistoricalContext=false`: hubungan identitas/periode/nilai memerlukan pemeriksaan sebelum digunakan pada fitur pembacaan historis.
- `snapshot-only`: riwayat masih ada tetapi data murid sumber tidak tersedia. Nilai tidak diambil dari semester lain.

Kelengkapan awal memakai seluruh mapel kelas, sehingga pilihan mapel, agama, format narasi, catatan, absensi, penandatangan, dan identitas satuan pendidikan tetap perlu verifikasi pada tahap berikutnya. Tidak ada klaim siap finalisasi berdasarkan jumlah nilai saja.

## Menjalankan audit

```powershell
node scripts/audit-report-history-copy.mjs --database data/database.sqlite3 --uploads data/uploads --output dist/backups/report-history
```

Database dan folder unggahan wajib disebutkan. `--uploads` dapat diulang bila penyimpanan foto/profil/dokumen terpisah. Sesuaikan lokasi dengan konfigurasi server; jangan menganggap folder laptop pengembang sebagai folder PC sekolah. Gunakan `--school <id>` untuk memfilter laporan satu sekolah; backup tetap memuat seluruh database yang disebutkan.

Alat membuat direktori baru setiap kali dijalankan dan tidak menimpa backup. Snapshot menggunakan `VACUUM INTO`, tanpa menjalankan ensure schema atau migrasi. Unggahan disalin secara fisik, bukan sekadar didaftarkan pada manifest. Hash sumber sebelum/sesudah penyalinan dibandingkan dengan salinan; symlink/junction dan jalur keluar folder ditolak. Referensi foto murid/pegawai, dokumen pegawai, lampiran, dan dokumentasi profil diperiksa terhadap berkas backup. Referensi hilang atau hash/ukuran tidak cocok membuat backup ditandai belum lengkap.

Isi direktori hasil:

- `database.sqlite3`: snapshot database.
- `uploads-*`: salinan fisik unggahan sesuai root yang disebutkan.
- `manifest.json`: checksum database/berkas, asal root, serta hasil pemeriksaan referensi.
- `audit.json`: hasil rinci per murid/periode, termasuk peringatan NISN dan relasi.
- `ringkasan.md`: ringkasan yang dapat dibaca operator.
- `qa-restore/`: salinan pemulihan pengujian ke direktori baru. Checksum dan audit ulang harus sama dengan snapshot; tidak mengganti database operasional.

Backup SQLite dan filesystem tidak merupakan satu transaksi lintas media. Bila ada unggahan/penghapusan bersamaan, hentikan pekerjaan tersebut dan ulangi backup sebelum pemulihan produksi. Uji salinan ini bukan pengganti simulasi pembaruan aplikasi penuh atau uji PC sekolah.

Laporan rinci, UID, nama berkas, backup, dan foto bersifat internal. Simpan hasil di `dist/backups` atau `tmp` yang diabaikan Git. Jangan unggah ke repo/rilis publik.

## Hasil pemeriksaan lokal 31 Oktober 2026

- 92 baris murid, 92 UID dan 92 riwayat kelas; tidak ditemukan konflik identitas/relasi pada data murid yang tersedia.
- Seluruh murid lokal berada pada semester ganjil 2026/2027. Belum ada data murid lintas semester untuk membuktikan riwayat nyata; skenario lintas periode diuji dengan fixture terpisah.
- 1 NISN belum valid; 92 catatan status berkunci lama dibiarkan terpisah tanpa penggabungan atau penghapusan.
- Belum ada nilai sumatif sekolah maupun nilai keasramaan. Kelas/riwayat tersedia tidak berarti rapor lama siap ditampilkan.
- Snapshot dan 4 berkas unggahan (614.740 byte) berhasil disalin dan diuji pada salinan. Dua referensi berkas yang diperiksa tersedia dan cocok.
- Hasil ini hanya untuk database lokal; kelengkapan data dan rapor pada PC sekolah belum diperiksa.

## Validasi

```powershell
node --test src/lib/server/report-history-audit.test.ts
```

Pengujian meliputi pembatasan sekolah/periode, nilai nol, data kosong, UID meragukan, NISN berulang, riwayat tanpa sumber, relasi kelas/tujuan keliru, predikat tidak valid, tabel hilang, mode baca-saja, backup blob/foto, checksum rusak, pencegahan overwrite, dan path traversal. Tahap selanjutnya memakai hasil audit untuk memperluas Riwayat Kelas menjadi Riwayat Pendidikan; belum dilakukan pada tahap ini.

Hasil validasi: 12 tes audit/backup lulus dan seluruh 359 tes unit proyek lulus. TypeScript strict terfokus serta ESLint pada modul/skrip baru lulus. Build UI tidak dijalankan ulang karena tahap ini hanya menambah alat audit mandiri, tanpa mengubah komponen atau alur runtime aplikasi.
