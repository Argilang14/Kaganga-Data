# Pengelompokan Scan QR (tahap 1-18)

## Hasil audit

- Scan murid memakai `/api/administrasi/absensi/scan`, dengan protokol lama `sekolah` (harian) atau `kegiatan` (kegiatanId). Tampilan baru memakai protokol `kegiatan` beserta `scanGroup`; nilai mode tidak dikenal ditolak, tidak dialihkan diam-diam ke harian. Protokol lama dipertahankan untuk kompatibilitas klien.
- Scan kelas memakai `/api/administrasi/absensi/monitoring-kelas`, dengan pertemuan, jadwal, guru/pengganti, tanggal, dan token kelas. Ini bukan presensi kerja pegawai dan tidak mengabsen murid otomatis.
- Kegiatan murid memiliki ID tetap per sekolah. Batas unik murid/kegiatan/tanggal dan penanganan scan ganda tetap digunakan.
- Izin pulang sudah mempunyai catatan keluar/kembali. Monitoring memakai rentang waktu tersebut untuk melengkapi sel yang belum tercatat; catatan kehadiran nyata tidak ditimpa.
- Klasifikasi pegawai `keamanan` sudah tersedia, tetapi role akun Tim Keamanan belum ada sebelum perubahan ini.

## Kelompok dan sumber data

| Mode | Kegiatan | Role dasar | Sumber |
| --- | --- | --- | --- |
| Pegawai | Absen Kelas | Guru/Wali Kelas | Pertemuan monitoring kelas, bukan kegiatan murid baru |
| Sekolah | Apel Berangkat/Pulang, Zuhur/Asar | Guru/Wali Kelas | ID kegiatan yang sudah ada |
| Makan | Pagi/Siang/Malam | Tim Dapur | ID kegiatan makan yang sudah ada |
| Asrama | Berangkat/Tiba, Apel Malam, Sholat 5 Waktu | Wali Asuh/Wali Asrama | ID kegiatan yang sudah ada |
| Pulang | Pulang ke Rumah, Kembali ke Sekolah | Tim Keamanan | Perjalanan terkait izin pulang yang sudah diterbitkan |

Admin dan jabatan operasional mempertahankan akses pengawasan sesuai kebijakan yang sudah ada. Cakupan murid/kelas tidak diperluas oleh pengelompokan ini. Guru hanya dapat mencatat Zuhur/Asar pada Senin-Jumat; wali tetap mempunyai lima waktu termasuk akhir pekan. Input makan kini khusus Tim Dapur atau akun operasional sekolah.

`attendance-scan.ts` menghasilkan kontrak kelompok untuk loader Scan QR. Pegawai dan Pulang sudah aktif dan wajib daring. Absen Asrama untuk pegawai belum tersedia.

## Tahap 7-12

7. Mode scan sesuai izin akun. Mode Pulang terlihat bagi akun yang berhak, tetapi belum dapat dipakai.
8. Kegiatan wajib dipilih secara eksplisit. Pergantian mode menghapus kegiatan, status, pertemuan, dan hasil sebelumnya. Server memvalidasi kecocokan `scanGroup` dengan kegiatan.
9. Absen Kelas memuat pertemuan milik guru terjadwal atau pengganti. `/api/administrasi/absensi/scan/kelas` memakai pengaman transaksi `scanClassMeeting` yang sama dengan Monitoring Kelas: sekolah, QR, penugasan, hari libur, tanggal server, waktu jadwal, pegawai aktif, dan scan ganda.
10. Hasil scan menampilkan guru, kelas, mapel, jam, waktu scan, serta tautan jurnal dengan konteks pertemuan. Scan tidak membuat jurnal atau kehadiran murid otomatis.
11. Scan kelas hanya daring dan tidak masuk antrean. Antrean murid dipisahkan menurut akun/sekolah. Antrean lama tanpa identitas pemilik tetap tersimpan, disertai peringatan untuk diperiksa operator, dan tidak dikirim otomatis dari akun lain.
12. Uji salinan SQLite mencakup izin, sumber sholat bersama, scan ganda lintas endpoint, guru pengganti, pengisian jurnal, QR melalui kamera sintetis ZXing, dan layar 320-1440 piksel.

## Batas role Tim Keamanan

- Role akun `tim_keamanan` terkait pegawai aktif berjenis `keamanan` dalam sekolah yang sama. Pembuatan satuan, edit, filter, dan akun massal mendukung role ini, tanpa mapel, kelas, atau binaan.
- Izin dasar hanya `absensi_scan` dan `absensi_perjalanan`. Izin perjalanan berbeda dari `absensi_izin_pulang`: tidak mengizinkan penerbitan, pembatalan, atau pengubahan izin pulang.
- Tidak mendapat halaman data murid, nilai, monitoring umum, pengaturan kegiatan, cetak, atau reset QR. Profil pegawai sendiri tetap memakai pengamanan profil yang sudah ada.
- Endpoint scan murid lama tetap menolak Tim Keamanan. Perjalanan memakai `/api/administrasi/absensi/scan/perjalanan`. Tidak ada token kelas/murid, catatan izin, atau absensi yang dibuat hanya karena role ditambahkan.
- Akses identitas murid untuk verifikasi perjalanan harus dibatasi pada respons scan yang tervalidasi saat tahap 13-18, bukan membuka daftar murid atau foto massal.

## Satu sumber sholat

- Zuhur/Asar pada mode Sekolah dan Asrama merujuk ID kegiatan yang sama. Kelompok tampilan tidak membuat salinan kegiatan atau catatan kehadiran.
- Alias lama `sholat_dzuhur`, `sholat_ashar`, dan `sholat_maghrib` dikenali. Seeder tidak menambahkan versi ejaan lain jika aliasnya sudah ada.
- Pemilihan sumber deterministik: pilih kode baku jika ada, lalu ID terkecil. Monitoring menggunakan aturan default yang sama; pemilihan sumber eksplisit untuk membaca riwayat tetap didukung.
- Jika instalasi lama sudah memiliki dua ID untuk alias yang sama, tidak ada penggabungan/penghapusan otomatis. Riwayat tetap utuh; peninjauan dan migrasi riwayat memerlukan pekerjaan terpisah.

## Tahap 13-18

13. Verifikasi QR murid aktif dan satu izin yang berlaku dalam sekolah yang sama. Izin mendatang, dibatalkan, sudah ditutup, atau ganda ditolak. Tim Keamanan hanya menerima nama, kelas, serta ringkasan izin setelah QR valid; tidak mendapat daftar murid, alasan kesehatan, kontak, atau akses foto massal.
14. Pulang ke Rumah menampilkan konfirmasi sebelum menulis. Konfirmasi memeriksa ulang QR, izin, revisi, pegawai keamanan aktif dan waktu server. Scan bukan penerbit izin. Jadwal keberangkatan yang sudah lewat rencana kembali perlu ditinjau operator.
15. Kembali ke Sekolah menutup izin dengan tanggal/jam aktual. Izin manual lama tetap bisa ditutup tanpa mengarang waktu scan keberangkatan. Murid terlambat tetap dapat dicatat kembali. Izin yang telah kembali tidak memblokir pembuatan izin berikutnya.
16. Tabel `perjalanan_murid` menyimpan verifikasi keluar/kembali dan petugas secara terpisah dari izin lama. Waktu aktual keluar menjadi batas awal proyeksi status. Monitoring sekolah/asrama/sholat/makan, Catat Absensi, rekap, ringkasan, Excel dan PDF membaca proyeksi izin; proyeksi tidak ditulis sebagai absensi palsu. Manual/QR nyata tetap dipertahankan. Auto alfa baru melewati murid yang tercakup izin; auto alfa lama dapat ditampilkan sebagai izin tanpa menghapus sumbernya.
17. Konfirmasi memakai transaksi dan revisi izin sehingga scan bersamaan tidak menggandakan perjalanan/audit. Izin yang telah dipakai berangkat tidak dapat dibatalkan lewat aksi biasa. Scan perjalanan wajib daring, tidak menerima `capturedAt` klien dan tidak masuk antrean offline. Waktu perjalanan memakai Asia/Jakarta, termasuk jika zona waktu OS berbeda.
18. `scripts/test-attendance-travel-copy.mjs` menguji API, izin, persaingan scan, proyeksi lintas kegiatan, QR dicabut, kamera sintetis ZXing, serta ukuran 320-1440 piksel pada salinan SQLite. Uji unit waktu dan aturan izin ada di `attendance-travel.test.ts`.

Rencana kembali tidak menutup izin otomatis. Kembali ke sekolah tidak otomatis berarti hadir di asrama atau hadir pada semua kegiatan. Riwayat saat pulang tetap tersimpan. Untuk kegiatan tanpa jam, tampilan hari ini menggunakan waktu saat dibuka; laporan historis memakai aturan konservatif (izin harus mencakup seluruh tanggal). Atur jam kegiatan untuk laporan lintas waktu yang lebih tepat. Proyeksi tidak mengubah nilai rapor atau membentuk keputusan disiplin otomatis.

## Konfirmasi pulang dan penjemput

- Halaman `/administrasi/absensi/konfirmasi-pulang` memakai izin `absensi_perjalanan` dan pemeriksaan pegawai keamanan aktif. Daftar dibatasi ke izin sekolah yang sedang diakses, 20 baris per halaman. Nama/kelas, nomor izin, penjemput/hubungan, jadwal, dan petugas perjalanan boleh terlihat; alasan kesehatan, kontak penjemput, dan biodata lengkap tidak dikirim.
- Tab Konfirmasi Keluar, Sedang Pulang, dan Riwayat memakai sumber izin/perjalanan yang sama. Izin lama tanpa scan tetap berlabel Belum diverifikasi keamanan, bukan dianggap pasti masih berada di sekolah. Peringatan terlambat tidak menutup izin. Halaman memperbarui daftar saat daring setiap 30 detik atau ketika dibuka kembali.
- Nama penjemput dan hubungan wajib untuk izin baru. Pemberi izin yang berwenang dapat memperbaikinya lewat Ubah Penjemput di Rekap Absensi sebelum keberangkatan terkonfirmasi. Perbaikan memakai revisi, transaksi, dan audit; Tim Keamanan tidak diberi izin mengubahnya.
- QR tetap wajib untuk konfirmasi dari daftar. Penjemput harus dicocokkan dengan izin dan kotak pemeriksaan dicentang. Server menolak data penjemput kosong atau konfirmasi tanpa pemeriksaan. Jika penjemput berbeda, hentikan proses dan hubungi pemberi izin. Perubahan penjemput membatalkan pratinjau lama. Audit keberangkatan menyimpan nama/hubungan yang diperiksa.
- Scan ulang kegiatan atau perjalanan tampil merah dengan nama pegawai, role, dan waktu pertama jika tersedia. Catatan manual tetap disebut Sudah tercatat. Riwayat tidak ditimpa; batas duplikat adalah murid/tanggal/kegiatan yang sama. Scan kegiatan berbeda tetap diperbolehkan. Pemeriksaan antarperangkat memerlukan koneksi; antrean offline baru dapat diperiksa setelah tersambung, sedangkan perjalanan tidak pernah masuk antrean.

## Verifikasi

Jalankan unit test `attendance-scan`, `attendance-access`, `attendance-monitoring`, `attendance-school-dorm`, `user-role`, `bulk-user`, `role-menu-access`, dan `class-monitoring`. Integrasi akun/izin/API diuji melalui `scripts/test-user-roles-copy.mjs` pada salinan SQLite, bukan database operasional. Lanjutkan dengan `pnpm check` dan `pnpm build`.
