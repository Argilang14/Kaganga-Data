# Ringkasan absensi untuk grup guru

Fitur tersedia melalui:

- Scan QR: **Selesai & Ringkasan**, sekaligus menghentikan kamera.
- Absensi Kegiatan: **Ringkasan WhatsApp**.
- Rekap Kegiatan: **Ringkasan WhatsApp**.

## Penggunaan

1. Pilih satu tanggal dan satu kegiatan sumber, misalnya Apel Berangkat.
2. Pilih cakupan kelas; akun dengan akses seluruh sekolah dapat memilih jenjang atau seluruh jenjang.
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

Guru dan wali tidak dapat memperluas akses melalui perubahan URL. Rekap wali asuh/asrama
ditandai sebagai anak binaan, bukan jumlah seluruh murid kelas. NIS/NISN, token QR, alasan
medis, nomor orang tua, dan password tidak dimasukkan ke pesan.

API ringkasan hanya membaca data dan tidak menjalankan Auto Alfa. Salin/Bagikan membaca
ulang data server. Scan offline yang belum tersinkron belum termasuk hasil tersimpan;
sinkronkan terlebih dahulu. Pesan WhatsApp lama tidak diperbarui otomatis.

Belum mencakup notifikasi kepada orang tua, jaminan penerima grup tertentu, atau pelacakan
status terkirim/dibaca. Petugas tetap harus memastikan grup yang dipilih benar.
