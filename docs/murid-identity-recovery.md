# Pemeriksaan dan pemulihan identitas murid

## Tujuan

Mencegah pengarsipan satu murid memengaruhi murid lain yang memakai NISN kosong,
placeholder, atau duplikat. NISN bukan kunci perubahan status; status memakai UID
internal. Murid yang sama lintas semester dapat tetap memakai UID yang sama.

## Pemeriksaan sebelum pemulihan

1. Backup SQLite pada PC server sekolah dan salin folder foto/lampiran. Backup
   pengembang tidak menggantikan backup PC sekolah.
2. Audit salinan backup, tanpa `--apply`:

   ```powershell
   node scripts/audit-murid-identity.mjs --database "C:\backup\database.sqlite3"
   ```

3. Periksa `pendingReviews` dan `identityConflicts`. Temuan konflik tidak boleh
   diatasi dengan impor Excel ulang, menghapus semua arsip, atau mengganti UID
   secara massal.
4. Login sebagai admin, buka Arsip Murid & Alumni, cari murid dan buka aksi
   **Periksa Identitas**. Cocokkan ID sumber, nama, NIS/NISN, tanggal lahir,
   kelas/periode, riwayat dan snapshot lama dengan dokumen sekolah.
5. Pilih **Pulihkan ke Aktif** hanya bila murid masih terdaftar. Data salah input
   atau murid yang benar-benar keluar tetap diarsipkan. Masukkan alasan dan
   konfirmasi pemeriksaan.
6. Pastikan murid yang dipulihkan muncul pada kelas/periode yang benar. Ekspor
   Aktif, Arsip, dan Semua Status memiliki cakupan berbeda dan memakai semester
   aktif; jangan menganggap seluruh baris ekspor adalah murid kelas yang sedang
   ditampilkan.

## Pengaman

- Identitas ambigu tidak dapat diubah melalui perubahan status massal.
- Pemeriksaan identitas hanya untuk admin, satu identitas per keputusan.
- Hubungan sumber yang hilang, sekolah/semester salah, atau data pribadi berbeda
  dalam satu UID menghentikan transaksi tanpa perubahan sebagian.
- Perubahan nama/NIS/tanggal lahir antarperiode juga dapat menyebabkan pengaman
  tersebut aktif. Verifikasi koreksi historis terlebih dahulu, jangan otomatis
  memisahkan UID murid yang sebenarnya sama.
- Snapshot lama baca-saja tetap disimpan dan tidak dapat diaktifkan ulang menjadi
  murid baru tanpa data sumber.
- Keputusan tersimpan di audit, termasuk alasan, status sebelum/sesudah dan ID
  murid terkait. QR, nilai, presensi dan dokumen tidak dihapus oleh pemeriksaan.
- NISN yang belum tersedia boleh kosong. NISN resmi memakai 10 digit sebagai teks;
  jangan mengisi nomor perkiraan. Angka nol awal tetap dipertahankan.

## Batasan penerapan

Perbaikan kode lokal tidak otomatis memulihkan database atau memperbarui installer
PC sekolah. Pemulihan kasus sekolah memerlukan backup terbaru dari PC tersebut.
Tidak ada perubahan NISN otomatis, pemadatan SQLite, atau migrasi ulang otomatis
untuk keputusan identitas yang sebelumnya telah ditinjau.

## Hapus permanen untuk Keluar Sekolah

- Hanya admin dan hanya status Keluar Sekolah yang sudah selesai diperiksa.
- Buka Hapus Permanen pada kolom Aksi, lalu Periksa Dampak Penghapusan.
- Pratinjau mencakup data murid lintas periode, nilai, presensi dan riwayat yang
  ikut dihapus. Snapshot ujian dengan relasi SET NULL tetap disimpan.
- Ketik nama persis, isi alasan dan centang persetujuan. Tidak ada hapus massal.
- Database dibackup otomatis dan diperiksa sebelum transaksi penghapusan.
  Jika backup gagal atau data berubah sejak pratinjau, penghapusan dibatalkan.
- Identitas yang belum selesai diperiksa, relasi tidak aman, STTM terbit atau
  lampiran murid terdaftar memblokir penghapusan. Berkas terdaftar harus dikelola
  melalui Manajemen Berkas terlebih dahulu.
- Snapshot lama dapat dibersihkan hanya jika tidak lagi terkait data sumber,
  riwayat murid hidup, atau pemeriksaan identitas yang belum selesai.
- Foto fisik, dokumen snapshot, data wali/alamat bersama, dan audit tidak dihapus
  otomatis. Pemulihan data yang terhapus membutuhkan backup, bukan tombol Aktif.
- Menghapus baris tidak otomatis mengecilkan berkas SQLite. Backup juga memakai
  ruang disk dan harus mengikuti kebijakan penyimpanan sekolah.
