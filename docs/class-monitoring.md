# QA Monitoring Kelas

Monitoring kelas menghubungkan jadwal pelajaran, QR kelas, konfirmasi kehadiran guru, alasan ketidakhadiran, guru pengganti, dan pintasan jurnal mengajar. QR membuktikan bahwa pemegang akun memperoleh token kelas yang sedang berlaku; fitur ini **bukan bukti kriptografis lokasi fisik guru** dan tidak menggantikan supervisi sekolah.

## Alur penggunaan

1. Siapkan jadwal aktif, jam pelajaran, mapel, dan pegawai guru di menu Kurikulum. Monitoring memakai jadwal sesuai tanggal dan jenis semester, bukan data absensi murid.
2. Buka **Absensi > Monitoring Kelas**. Guru mendapat akses lihat/scan pertemuannya; admin dan jabatan berwenang mendapat akses pengelolaan. Petugas lain dapat diberi izin `class_monitoring_manage` melalui Manajemen Pengguna.
3. Pilih **Kelola QR**, pilih kelas, tampilkan, dan cetak QR. QR siswa tidak dapat digunakan sebagai QR kelas. Membuat ulang QR membatalkan cetakan lama.
4. Guru terjadwal membuka pertemuan yang sedang berlangsung, memindai QR kelas, lalu mengonfirmasi penyimpanan. Kamera memerlukan HTTPS atau localhost; kode dapat dimasukkan manual bila kamera tidak tersedia.
5. Petugas mencatat sakit/izin dan menunjuk pegawai aktif sebagai pengganti untuk pertemuan itu saja. Pengganti menggunakan akun sendiri, tanpa perlu menambah penugasan murid atau mengubah jadwal utama.
6. Gunakan **Isi jurnal** untuk membuka tanggal, kelas, mapel, dan blok jam yang sama. Jurnal tetap harus diisi guru; scan tidak membuat jurnal kosong.

Hijau berarti sudah dipindai, kuning berarti jam sedang berjalan tetapi belum scan, abu-abu berarti belum dimulai, biru berarti sakit/izin, dan merah berarti jam terlewat tanpa scan. **Merah bukan otomatis alfa.** Riwayat yang sudah dicatat mempertahankan snapshot saat jadwal berubah. Input ini memerlukan koneksi server; antrean offline belum ditambahkan.

## Menjalankan QA terisolasi

Jalankan build utama lebih dahulu, kemudian jalankan QA:

```powershell
pnpm build
node scripts/test-class-monitoring-copy.mjs
```

Port bawaan QA adalah `5179`. Port itu harus kosong. Port produksi `5152` dan `1206` ditolak secara eksplisit. Untuk memakai port QA lain:

```powershell
$env:CLASS_MONITORING_QA_PORT = '5180'
node scripts/test-class-monitoring-copy.mjs
```

Script tidak menjalankan build dan tidak membuka atau menghentikan server produksi. Database sumber hanya dibaca melalui `VACUUM INTO`; seluruh seed dan mutasi berjalan pada salinan baru di `tmp/class-monitoring-qa-*`. Server `build/index.js` memakai `windowsHide: true`, diarahkan ke salinan tersebut, dan selalu dihentikan serta ditunggu sampai keluar pada blok `finally`.

## Cakupan otomatis

- Tanggal dan nama hari diturunkan dari waktu `Asia/Jakarta`, termasuk Sabtu dan Minggu. Jadwal QA menggunakan rentang `00:00-23:59` agar pertemuan tersedia sepanjang hari.
- Tiga kelas, murid, sekolah, tahun ajaran, semester, template, dua JP berurutan, guru P1/P2, dan guru pengganti P3 dibuat dengan nama `QA Monitoring ...`.
- Respons GET diperiksa memiliki daftar kelas/pertemuan dengan `key`, `canScan`, dan kemampuan `canManage`; kelas sekolah lain serta kelas non-seed tidak boleh bocor.
- Admin, kepala sekolah, dan waka kurikulum diuji sebagai pengelola. Guru P1/P2 diuji hanya terhadap pertemuan yang menjadi penugasannya. Tim dapur dan wali asrama ditolak. Sesi memakai token acak yang disimpan sebagai SHA-256 di `auth_session`.
- Pembuatan QR hanya diterima dari pengelola berwenang (termasuk admin, Kepsek, dan Waka Kurikulum) dengan bentuk `{ action: 'qr', kelasIds }`, dan hasilnya harus berisi kartu `{ kelasId, nama, token, payload }`.
- Scan memakai `{ action: 'scan', key, qr, tanggal, jenis }`. QA mencakup dua JP yang tergabung, guru salah, jadwal tidak ada, tanggal lama/mendatang, scan guru pemilik, serta scan guru pengganti.
- Ketidakhadiran memakai `{ action: 'absence', key, tanggal, jenis, reason, substitutePegawaiId?, note? }` dengan alasan `sakit` dan `izin`.
- Scan dan pencatatan ketidakhadiran dijalankan berulang serta paralel untuk membuktikan idempotensi dan batas unik database.
- Regenerasi QR harus mengganti token dan menolak token lama. Pemalsuan kelas lintas sekolah juga ditolak.
- Snapshot pertemuan harus tetap menyimpan nama kelas, mapel, dan ID jadwal sesudah sumber jadwal diedit atau dihapus.
- GET tidak boleh menciptakan baris monitoring. Scan tidak boleh otomatis menciptakan jurnal; setelah scan, alur jurnal harus membawa `monitoringKey` tersembunyi dan tetap terikat pada konteks pertemuan/guru pengganti.
- Jumlah `absensi` murid seed dibandingkan sebelum dan sesudah QA dan harus tetap sama.
- Halaman difoto pada desktop `1440x1000`, tablet `768x1024`, dan ponsel `390x844` serta `320x740`. Nama sekolah, kelas, dan murid berisi markup uji agar escaping ikut diverifikasi. Screenshot hanya memuat fixture QA.
- Jurnal pengganti diuji sampai tersimpan, dengan penolakan kelas palsu dan duplikasi. Pop-up cetak QR serta pembatalan kamera ketika masih memulai juga diuji memakai media sintetis, bukan kamera fisik sekolah.
- QR fisik dirender memakai paket `qrcode`, lalu dibaca kembali oleh `@zxing/browser`; tidak ada pembentukan atau pembacaan pola QR buatan tangan.
- `PRAGMA foreign_key_check` harus kosong dan `PRAGMA integrity_check` harus menghasilkan `ok`.

Direktori bukti dicetak pada akhir proses. Isinya mencakup database salinan dan screenshot `class-monitoring-desktop.png`, `class-monitoring-mobile.png`, serta `physical-qr-decoded.png`. Jika proses gagal, direktori yang sama tetap dicetak untuk investigasi.

## Uji manual sekolah

Uji lapangan belum dilakukan; pelaksanaannya menunggu jadwal operasional, akun petugas yang berwenang, perangkat kamera, QR cetak, dan persetujuan sekolah. Jangan memakai data produksi sebagai fixture screenshot.

Saat prasyarat tersedia, lakukan uji terbatas pada kelas percobaan yang disetujui:

1. Admin menerbitkan dan mencetak QR kelas, lalu memastikan kartu menampilkan sekolah dan kelas yang benar tanpa teks mentah/markup yang dapat dieksekusi.
2. Guru terjadwal membuka monitoring pada perangkat desktop dan ponsel, memindai QR, lalu memastikan hanya pertemuan miliknya yang dapat dikonfirmasi.
3. Admin menetapkan guru pengganti, guru pengganti memindai QR, dan pintasan jurnal membuka konteks pertemuan yang sama.
4. Admin meregenerasi QR dan memastikan cetakan lama ditolak.
5. Petugas memeriksa bahwa data absensi murid tidak berubah akibat seluruh alur monitoring kelas.

Catat waktu, kelas uji, peran akun, perangkat/browser, hasil scan, hasil jurnal, dan bukti persetujuan. Hindari klaim bahwa keberhasilan scan sendiri membuktikan kehadiran fisik guru; token dapat dipindahkan atau difoto dan harus diperlakukan sebagai kontrol operasional, bukan bukti lokasi.
