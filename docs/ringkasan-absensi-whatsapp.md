# Ringkasan absensi untuk grup guru

Fitur tersedia melalui:

- Scan QR: **Selesai & Ringkasan**, sekaligus menghentikan kamera.
- Absensi Kegiatan: **Ringkasan WhatsApp**.
- Rekap Kegiatan: **Ringkasan WhatsApp**.

## Penggunaan

1. Pilih satu tanggal dan satu kegiatan sumber, misalnya Apel Berangkat.
2. Pilih Per kelas, Per jenjang, Seluruh jenjang, atau Antar kelas. Guru, Wali Kelas, Wali Asuh, dan Wali Asrama dapat membaca ringkasan seluruh sekolahnya pada semester aktif.
   Pada Antar kelas, centang kelas yang diperlukan, misalnya hanya X.A-X.D tanpa kelas XI. Filter jenjang hanya menyaring daftar pilihan, bukan menghapus kelas yang sudah dicentang.
3. Periksa pratinjau, daftar nama, jumlah murid dan peringatan.
4. Salin Ringkasan atau Bagikan ke WhatsApp.
5. Pilih grup guru sekolah dan konfirmasi pengiriman di WhatsApp.

Tidak ada bot, API berbayar, konfigurasi nomor pengirim, atau pengiriman otomatis.
Membuka WhatsApp tidak berarti pesan sudah terkirim. Pesan panjang memakai salin/tempel.

## Perhitungan

- Sumber hanya murid aktif pada sekolah dan semester aktif, sesuai cakupan akses akun.
- Setiap murid dihitung sekali untuk tanggal dan kegiatan terpilih.
- Hadir mencakup Hadir dan Terlambat.
- Tidak Hadir memuat nama dan kode s (Sakit), i (Izin), a (Alfa), atau p (Izin Pulang).
- (p) memerlukan catatan izin pulang yang masih berlaku pada tanggal tersebut. Status Pulang biasa tidak otomatis berarti tidak hadir.
- Pada tanggal anak kembali dari izin, status kehadiran perlu dicatat untuk kegiatan terkait; jangan mengandalkan catatan izin sebelumnya.
- Status Pulang tanpa catatan izin ditandai perlu konfirmasi, bukan langsung tidak hadir.
- Belum tercatat memuat anak tanpa status yang terkonfirmasi; bukan otomatis Alfa.
- Jumlah = Hadir + Tidak Hadir + Belum tercatat.
- Jenjang dibaca dari fase/tingkat kelas; kelas yang belum dapat dipetakan mendapat peringatan.

## Keamanan

Perluasan cakupan berlaku hanya untuk ringkasan baca, bukan hak input/koreksi, pengaturan,
ekspor Excel, nilai, atau data murid. Kelas harus berasal dari sekolah dan semester aktif;
ID kelas di luar cakupan ditolak. Akun Tim Dapur tetap mengikuti cakupan sebelumnya.
NIS/NISN, token QR, alasan medis, nomor orang tua, dan password tidak dimasukkan ke pesan.

API ringkasan hanya membaca data dan tidak menjalankan Auto Alfa. Salin/Bagikan membaca
ulang data server. Scan offline yang belum tersinkron belum termasuk hasil tersimpan;
sinkronkan terlebih dahulu. Pesan WhatsApp lama tidak diperbarui otomatis.

Belum mencakup notifikasi kepada orang tua, jaminan penerima grup tertentu, atau pelacakan
status terkirim/dibaca. Petugas tetap harus memastikan grup yang dipilih benar.

## Scan ulang antarpetugas

- Satu murid hanya dicatat sekali untuk tanggal dan kegiatan yang sama, termasuk ketika dua petugas melakukan scan bersamaan.
- Scan berikutnya menampilkan Sudah dipindai, petugas pencatat dan waktu yang tersimpan; tidak mengganti status atau membuat audit tambahan.
- Jika status sebelumnya berasal dari input manual, keterangan menjadi Sudah tercatat. Sakit/izin tidak ditimpa menjadi hadir, dan waktu scan yang tidak tersedia tidak dibuat-buat.
- Kegiatan berbeda tetap dapat dipindai, misalnya Masuk Sekolah dan Pulang Sekolah.
- Saat perangkat offline, hasil petugas lain belum dapat diketahui. Ketika sinkronisasi, catatan pertama yang berhasil tersimpan di server dipertahankan.
