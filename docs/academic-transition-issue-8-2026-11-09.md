# Pergantian periode: implementasi dan verifikasi issue #8

Tanggal: 9 November 2026. Implementasi disertakan dalam rilis v2.3.4.
Issue: https://github.com/Argilang14/Kaganga-Data/issues/8

## Keputusan yang diterapkan

- Aktivasi tahun/semester hanya mengubah konteks aktif. Penyiapan kelas, asrama, penempatan, pembelajaran, dan penugasan tetap dilakukan secara terpisah.
- Asrama mengikuti semester Data Rapor. Periode tujuan mulai kosong; riwayat asrama dan penempatan lama tetap disimpan. Ini menggantikan asumsi asrama lintas periode pada audit awal issue.
- Semua Murid dan Murid Pasif merupakan daftar identitas lintas periode. Belum mendapat penempatan pada periode aktif tidak otomatis berarti pindah, keluar, atau lulus.
- Desain tabel dan template PDF dipertahankan. Perubahan tampilan dalam pekerjaan ini hanya memperjelas teks keadaan kelas kosong.
- Penggabungan Riwayat Rapor ke Cetak Rapor tetap menjadi cakupan issue #7.

## Enam tahap

| Tahap                            | Hasil                                                                                                                                                                                                                                      |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1. Audit dan simulasi            | Simulasi aksi salin ganjil–genap, aktivasi semester, dan aktivasi tahun dijalankan pada salinan database dengan sekolah dan murid sintetis.                                                                                                |
| 2. Retensi dan pemulihan         | Penghapusan tahun aktif atau tahun berisi data ditolak. Pemeriksaan mencakup semua tabel dengan kolom tahun/semester, termasuk modul opsional. Penghapusan beberapa tahun bersifat atomik. Backup dan restore diuji.                       |
| 3. Kesinambungan identitas       | Salin semester mempertahankan biodata, foto, NIK, wali asuh, identitas stabil, dan QR pribadi. Portal wali dan pertumbuhan menelusuri anggota identitas lintas periode. Profil tambahan dan dokumentasi tetap memakai identitas yang sama. |
| 4. Batas penugasan               | Kesamaan nama kelas tidak lagi memberi akses kelas/cetak lintas periode. Kelas harus ditugaskan secara eksplisit. Mapel dari tahun lama tidak membuka mapel tahun baru. Penugasan asrama/wali asuh tetap diperiksa.                        |
| 5. Dokumen, presensi, perjalanan | Tanggal dokumen memakai periode kelas terpilih. Presensi pegawai memakai periode tanggal pencatatan. Izin berjalan dapat ditelusuri melalui identitas murid tanpa memindahkan catatan sumber. PDF final dan revisinya tetap utuh.          |
| 6. Regresi dan dokumentasi       | Uji layanan, aksi, endpoint perjalanan, PDF, backup/restore, browser, pemeriksaan tipe, dan build dijalankan; rincian di bawah.                                                                                                            |

## Perbaikan utama

### Salin semester

Seluruh biodata disalin dengan UID sumber, tanpa menggandakan token QR lama atau identitas anggota rombel sumber. Nilai tidak disalin. Pemanggilan ulang tidak menimpa wali kelas/fase yang sudah disesuaikan di tujuan dan tidak menggandakan murid yang telah ditempatkan di kelas lain pada semester tujuan. Konflik identitas menghasilkan pesan 409, bukan internal error.

### Retensi tahun ajaran

Tahun aktif dan tahun dengan data terkait ditolak sebelum penghapusan berantai terjadi. Tahun tidak aktif yang hanya memiliki kerangka semester kosong masih dapat dihapus. Pemeriksaan seluruh ID dan data terkait dilakukan dalam satu transaksi. Penghapusan sekolah secara eksplisit merupakan alur terpisah.

### Portal, profil, dan pertumbuhan

Tautan akun wali ke ID murid lama ditelusuri melalui identitas stabil. Jika periode aktif belum memiliki baris murid, anak tetap terlihat dengan keterangan belum ditempatkan. Nilai dan absensi pada kartu periode aktif hanya berasal dari baris aktif; nilai lama tidak ditampilkan sebagai nilai baru. Riwayat pertumbuhan dan dokumen terbit tetap dapat ditelusuri melalui anggota identitas. Profil tambahan dan foto privat tetap menggunakan profil milik UID yang sama.

### Akses arsip

Izin tersimpan `rapor_arsip_lihat` dapat digunakan oleh role pendidikan yang sesuai. Izin ini tidak otomatis diberikan dan tetap membutuhkan izin cetak yang sesuai serta pemeriksaan penugasan anak/kelas. Guru mapel tanpa hak wali kelas tidak memperoleh cetak rapor akademik penuh hanya karena diberi izin lihat arsip. Finalisasi dan revisi tetap membutuhkan hak tersendiri.

### Tanggal historis

Periode presensi ditentukan dari rentang tanggal semester yang tercatat. Jika tidak ada rentang yang cocok, nama tahun standar `YYYY/YYYY` atau `YYYY-YYYY` memakai batas 1 Juli–30 Juni. Periode yang ambigu atau tidak dapat dipastikan tidak digantikan dengan tahun aktif. Sekolah dengan nama tahun khusus atau kalender berbeda perlu melengkapi tanggal periode yang sesuai. Pengaturan harian/bulanan mengikuti tanggal/bulan yang dibuka.

### Izin berjalan

Izin dari baris murid periode lama dapat diproyeksikan ke baris periode tujuan saat membaca absensi. ID izin, ID murid sumber, dan perjalanan asli tetap dipertahankan. Penanganan izin oleh guru terbatas pada penugasan anak di periode aktif. Scan kembali dengan QR pribadi yang sama menyelesaikan perjalanan asli; scan ulang ditolak sebagai sudah tercatat.

## Bukti pengujian

Semua simulasi menggunakan salinan database, bukan mengganti periode database operasional.

| Pemeriksaan                                                               | Hasil                                                                                                                                                                                                        |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `node scripts/test-academic-transition-copy.mjs`                          | Lulus: salin lengkap, UID/QR, konflik identitas, idempotensi, portal, pertumbuhan, profil, tanggal historis, batas role, perjalanan lintas tahun, dan pengamanan hapus.                                      |
| Snapshot aktivasi tahun                                                   | Hash seluruh tabel selain flag tahun/semester dan audit dibandingkan sebelum/sesudah aksi; tidak berubah. Termasuk master, akun, nilai, absensi, lampiran, dan riwayat.                                      |
| QR kelas                                                                  | Kartu lama tetap tersimpan; permintaan kartu kelas tahun lama ditolak dari tahun baru. Kelas tujuan dengan nama sama mendapat token berbeda. QR kelas tidak mengikuti identitas murid.                       |
| `node scripts/test-user-roles-copy.mjs`                                   | Lulus: role gabungan, batas kelas/mapel, wali kelas, pencabutan penugasan, dan sesi pegawai.                                                                                                                 |
| `node scripts/test-student-registry.mjs`                                  | Lulus: penempatan, master murid, dan asrama per semester.                                                                                                                                                    |
| `node scripts/test-dorm-evaluation-copy.mjs`                              | Lulus: penugasan asrama/wali asuh, penilaian terpisah, cetak, arsip, dan perpindahan.                                                                                                                        |
| `node scripts/test-attendance-permit-recap-copy.mjs`                      | Lulus: rekap bulanan, izin, PDF, dan Pulang manual guru.                                                                                                                                                     |
| `node scripts/test-report-archive-copy.mjs`                               | Lulus, 11 kelompok: penolakan akses, konteks historis, PDF final, revisi, persetujuan bersamaan, cetak massal, integritas hash, backup dan restore PDF/database.                                             |
| `QA_PROFILE_PHOTOS=1 node scripts/test-murid-profile-foundation-copy.mjs` | Lulus, 13 kelompok: profil identitas lintas semester, foto privat, penugasan, backup berkas, dan perlindungan penghapusan. Fixture diperbarui memakai role/FK wali asuh, bukan pencocokan nama/jabatan lama. |
| Unit tanggal dan keselamatan database                                     | 5 pengujian lulus, termasuk backup, restore, dan penolakan database yang bukan Kaganga.                                                                                                                      |
| Browser pada build dan DB salinan                                         | Portal 1440/390 px, portal periode kosong, Data Kelas kosong, Data Asrama kosong, Semua Murid, dan Murid Pasif berhasil; tidak ada galat JavaScript.                                                         |
| `pnpm check`                                                              | 0 error, 119 warning pada 37 berkas.                                                                                                                                                                         |
| `pnpm build`                                                              | Lulus.                                                                                                                                                                                                       |
| ESLint terfokus                                                           | Tersisa 4 temuan yang sudah ada pada HEAD: `@ts-nocheck` di `cetak-bawaan.ts` dan 3 `any` di parser Excel riwayat pertumbuhan. Tidak ada temuan lain pada kumpulan berkas tahap ini.                         |

Artefak lokal berada di `tmp/issue8-*.log`, `tmp/academic-transition-88Lmv2`, dan direktori salinan yang disebut masing-masing log. Direktori `tmp` memuat data QA lokal dan tidak untuk dipublikasikan. Backup sebelum pekerjaan: `data/database-backup-pre-issue-8-transition-2026-11-09T14-28-29-702Z.sqlite3`, beserta manifest/berkas pendampingnya.

## Alur operator saat berganti periode

1. Buat backup database beserta lampiran dan dokumentasi.
2. Pastikan rapor yang harus dibekukan sudah difinalkan. Nilai yang tersimpan tidak otomatis menjadi arsip PDF final.
3. Pilih tahun/semester tujuan di Data Rapor.
4. Siapkan kelas dan wali kelas. Untuk ganjil–genap dalam tahun yang sama dapat memakai Salin Semester; pergantian tahun memakai alur penempatan/kenaikan yang tersedia.
5. Buat asrama periode tujuan dan tempatkan anak kembali. Siapkan pembelajaran, evaluasi, jadwal, serta penugasan guru/asrama sesuai periode tujuan.
6. Periksa contoh anak, QR, portal wali, dan izin berjalan. Pertahankan tahun lama agar riwayat tetap dapat ditelusuri.

Implementasi dan verifikasi ini belum merupakan uji deployment pada server produksi sekolah. Pengujian memakai database salinan dan tidak mengaktifkan tahun operasional untuk QA. Catatan publikasi tersedia pada [rilis v2.3.4](releases/v2.3.4.md).
