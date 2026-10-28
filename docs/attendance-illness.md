# Masa sakit absensi

## Aturan

- Input Sakit baru pada absensi harian atau kegiatan sekolah/asrama memulai masa sakit tiga tanggal kalender, dengan tanggal pertama dihitung sebagai hari pertama. Contoh: 1 November sampai 3 November, berakhir pukul 23.59 WIB.
- Tidak ada pengisian ulang otomatis untuk catatan lama. Tabel baru `absensi_masa_sakit` menyimpan periode, sumber, petugas, alasan, waktu kembali dan pembatalan; perubahan dicatat dalam audit.
- Catat Absensi, monitoring, dashboard, ringkasan scan, rekap kegiatan dan ekspor/PDF memakai periode yang sama. Baris turunan tidak disimpan sebagai catatan scan palsu.
- Hanya scan masuk sekolah (apel berangkat atau absensi harian) yang dapat mengakhiri periode dan mengganti Sakit pada catatan masuk hari itu menjadi Hadir/Terlambat. Scan makan, sholat, asrama dan QR guru masuk kelas tidak mengakhiri periode.
- Catatan sakit pada tanggal atau kegiatan sebelumnya tetap tersimpan. Kegiatan setelah kembali tidak otomatis menjadi Hadir.
- Setelah masa keterangan berakhir, kegiatan yang belum dicatat kembali menjadi Belum Tercatat. Catatan eksplisit yang sudah disimpan tidak dihapus. Alfa otomatis ditunda untuk murid yang masih menunggu pemeriksaan setelah masa sakit; petugas tetap dapat mencatat Alfa secara manual setelah memeriksa kondisi murid.
- Perpanjangan di Catat Absensi memakai status Sakit, tanggal terpilih, opsi Perpanjang sakit dan catatan alasan. Perpanjangan tidak memundurkan tanggal selesai dan pengiriman ulang yang sama tidak membuat periode ganda.
- Izin pulang tetap dilindungi. Masa sakit tidak dapat dipakai untuk melewati konfirmasi kembali oleh keamanan.
- Scan offline yang direkam sebelum periode terbaru dibuat tidak dapat mengakhiri periode tersebut. Perubahan berlangsung dalam transaksi bersama absensi dan audit; scan ulang mempertahankan petugas/waktu yang pertama.
- Penghitungan tanggal menggunakan Asia/Jakarta. Masa berlaku dinilai ketika data dibaca, sehingga tidak bergantung pada server menyala tepat saat tengah malam.

## UI dan pemeriksaan

Perubahan UI terbatas pada catatan kecil di sel status dan checkbox perpanjangan di kolom catatan. Acuan ukuran: **Fallback Kaganga**, memakai struktur, ukuran input, tabel responsif dan komponen yang sudah ada pada Catat Absensi/Monitoring. Tidak mengubah ukuran halaman, popup, sidebar, atau tabel; tidak mengklaim pengukuran Rapkumer terbaru.

Validasi: `node --test src/lib/attendance-illness.test.ts` dan `node scripts/test-attendance-illness-copy.mjs`. Aktifkan `QA_ILLNESS_UI=1` setelah build untuk uji HTTP scan bersamaan dan screenshot desktop/tablet/HP pada database salinan. Pengujian tidak menambah akun atau mengubah absensi pada database asli.
