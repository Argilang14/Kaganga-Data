# Monitoring Absensi: tahap 1-18

## Sumber data

- Menu: Absensi > Monitoring & Rekap Absensi > Monitoring, `/administrasi/absensi/monitoring`.
- Layanan baca bersama: `src/lib/server/attendance-monitoring.ts`. API GET mengikuti sesi dan izin yang sama.
- Sekolah: `apel_berangkat` untuk masuk, `apel_pulang` untuk pulang. Masuk bisa dipilih menjadi Absensi Harian Sekolah, tetapi tidak dicampur otomatis dengan kegiatan.
- Sholat: `sholat_subuh`, `sholat_zuhur`, `sholat_asar`, `sholat_magrib`, `sholat_isya`.
- Makan: `makan_pagi`, `makan_siang`, `makan_malam`.
- Apel Malam: `apel_malam`, untuk pengecekan kehadiran sebelum tidur, bukan bukti lokasi anak saat ini.
- Pilihan sumber berlaku dalam URL tampilan, bukan perubahan pengaturan sekolah. Kegiatan nonaktif/di luar kategori ditolak. Sumber yang hilang ditampilkan sebagai belum dipilih, bukan semua anak alfa.
- Tidak ada tabel baru, penerbitan QR, penyalinan catatan, pemanggilan auto-alfa, atau sinkronisasi raport saat membuka monitoring.

## Pengelompokan Menu

- Absensi Kegiatan kini bernama Catat Absensi; alamat `/administrasi/absensi/kegiatan` dan seluruh aksi pencatatan tetap sama.
- Monitoring dan Rekap memiliki satu pintu masuk sidebar, dengan tab Monitoring dan Rekap. Menu dibuka pada tab Monitoring.
- Alamat rekap lama `/administrasi/absensi/kegiatan/rekap` tetap berlaku dan langsung menampilkan tab Rekap, termasuk ekspor, impor, izin pulang, tindak lanjut dan sinkronisasi rapor sesuai izin lama.
- Setiap tab hanya memuat layanan datanya sendiri. Tidak ada penyalinan catatan, migrasi database atau perluasan hak akses.
- Dari Monitoring ke Rekap, tanggal yang dipilih menjadi tanggal awal/akhir rekap; kelas dan kegiatan pemantauan terpilih ikut dibawa. Dari Rekap ke Monitoring, tanggal akhir dan kelas yang dipilih ikut dibawa. Filter lain di masing-masing tab tetap berada pada URL halaman tersebut.

## Status dan tanggal

- Ringkasan dan daftar memakai hasil per-murid yang sama. Nama/status menyaring daftar; ringkasan tetap menunjukkan cakupan kelas/jenjang yang dipilih.
- Catatan QR/manual/auto yang sudah tersimpan ditampilkan apa adanya. Tidak hadir di suatu kegiatan tidak disimpulkan dari kegiatan lain.
- Belum tercatat tidak otomatis alfa. Status alfa otomatis yang sudah ada tetap diberi keterangan Otomatis.
- Izin pulang aktif, tidak dibatalkan, dan dalam sekolah/tahun/semester yang sama dapat mengisi sel kosong; catatan asli selalu diutamakan. Data penjemput, alasan, dan kontak tidak dibagikan lewat monitoring.
- Izin diperiksa pada jam mulai kegiatan. Jika jam tidak diketahui (termasuk absensi harian), hanya izin yang mencakup seluruh tanggal yang digunakan. Waktu keluar/kembali yang kosong diperlakukan konservatif, tidak digunakan untuk mengasumsikan izin sebelum waktu yang diketahui.
- Tanggal monitoring dan waktu yang ditampilkan memakai Asia/Jakarta. Catatan setelah tengah malam tetap mengikuti `tanggal` yang tersimpan, bukan dipindahkan ke tanggal sebelumnya. Pencatatan lama tidak diubah. Server pencatat tetap perlu memakai zona waktu sekolah; penyatuan seluruh penentuan tanggal pencatatan dapat diuji terpisah.

## Akses

- Menggunakan izin `absensi_lihat`; label izin pengguna mencakup monitoring.
- Admin/jabatan dengan akses sekolah memakai kebijakan operasional yang sudah ada.
- Guru/wali kelas mengikuti kelas penugasan, wali asuh/asrama mengikuti anak binaan melalui `studentAccessCondition`.
- Tim Dapur hanya tab Makan, termasuk saat parameter URL dimanipulasi. Tidak menerima sumber/rekap Sekolah, Sholat, atau Apel Malam.
- Kelas, siswa aktif, catatan, serta izin dibatasi sekolah dan semester aktif. Kelas tidak sah ditolak, bukan diganti diam-diam.
- Daftar 30 murid per halaman, pencarian nama dan penyaringan status. Data ringkasan hanya berisi identitas minimal untuk pemantauan.

## Batas tahap

Backup konsisten dibuat sebelum perubahan. Pengujian menggunakan salinan SQLite, bukan data produksi.
Rilis/installer tidak dibuat. Port produksi 1206 tidak digunakan.

## Pembaruan tahap 13-18

- Tombol muat ulang dan waktu pembaruan terakhir tersedia pada monitoring serta Absensi Hari Ini di dashboard. Pembaruan tiap 60 detik hanya ketika halaman terlihat dan perangkat online; kembali ke tab atau tersambung kembali memicu pembaruan.
- Permintaan tidak bertumpuk, memiliki timeout 15 detik, dibatalkan saat navigasi, dan tidak boleh menimpa filter/tab baru. Gangguan koneksi mempertahankan data lama dengan penanda offline/gagal, bukan memperbarui waktu secara palsu.
- Dashboard dan monitoring memakai `loadMonitoringSnapshot`, cakupan murid dan sumber masuk sekolah yang sama. Tidak ada penggabungan diam-diam absensi harian dengan kegiatan. Pilihan sumber dashboard mengikuti URL dan tautan Monitoring mempertahankannya.
- Daftar sakit, izin, alfa, dan izin pulang mengikuti sumber tersebut. Tim Dapur tidak menerima data masuk sekolah dari API dashboard. Ringkasan pegawai tetap berasal dari presensi pegawai.
- Tautan pencatatan per murid membawa kelas, tanggal, dan kegiatan yang tepat. Ditampilkan hanya jika menu, tanggung jawab kegiatan, dan izin tanggal akun memenuhi syarat; tujuan tetap memvalidasi ulang di server. Tautan rekap tersedia ketika kelas dipilih.
- QA memperluas unit test dengan respons refresh, sesi/izin berubah dan pembatalan. Salinan SQLite digunakan untuk uji QR, manual, koreksi, hapus, belum pulang, tanggal lama, semester, sekolah, penugasan wali, dan pembaruan dari sesi lain.
- Pengujian browser memakai desktop/tablet/mobile, simulasi polling/halaman tersembunyi/offline, dan respons terlambat setelah pergantian tab. Tidak melakukan akses ke port 1206.
- Pengiriman WhatsApp, installer, dan rilis bukan bagian tahap ini.

## Hasil verifikasi 6 Oktober 2026

- 27 unit test lulus. `pnpm check`: 0 error, 115 warning lama dalam 35 file. Build produksi selesai.
- 12 kelompok pengujian integrasi/browser lulus pada SQLite salinan. Pergantian sekolah, tahun ajaran, semester, izin tanggal, dan penugasan akun diuji; integritas SQLite `ok` dan foreign key bersih.
- QA isolasi dijalankan di port 5152, kemudian server Vite dikembalikan ke database pengembangan semula. Perbaikan label dropdown diverifikasi ulang pada QA port 5165, tanpa mengganggu server semula.
- Bukti QA final: `tmp/monitoring-qa-Kg4CT5/result.json`, screenshot desktop/tablet/mobile dan dashboard. Bukti QA 5152: `tmp/monitoring-qa-N3UL3e/result.json`.
- Server pengembangan 5152 kembali merespons `/login` dengan HTTP 200. Port 1206 tidak dioperasikan. Database sumber diperiksa baca-saja: integritas `ok`, 0 pelanggaran foreign key.

## Tampilan responsif: 6 Oktober 2026

- Desain pratinjau diterapkan hanya pada komponen Monitoring Absensi; API, pembatasan akun, penugasan murid, sumber data, dan mekanisme refresh tidak diganti.
- Tab kegiatan memakai ikon aplikasi dan penanda aktif hijau. Di HP tab tersusun dua kolom; filter tambahan menampung jenjang serta seluruh pilihan sumber kegiatan.
- Empat angka ringkasan mengikuti satu kolom pemantauan terpilih, bukan menjumlahkan kehadiran antarkegiatan. Tidak hadir mencakup sakit, izin, izin pulang, dan alfa, dengan rincian pada keterangan. Belum tercatat dan sumber belum dipilih tidak dianggap hadir/alfa atau catatan yang sudah terisi.
- Desktop memakai tabel dengan nama murid tetap terlihat saat tabel digeser mendatar. HP/tablet memakai daftar per murid; dua waktu pertama tampil langsung dan waktu lainnya dapat dibuka melalui detail. Filter status, kolom, pencarian, tautan pencatatan/rekap, serta pagination 30 murid tetap tersedia.
- Ikon, tab, badge status, dan latar mengikuti tema terang/gelap. Kontrol HP memakai sasaran sentuh minimal 44 px.
- 23 unit test lulus; lint file perubahan bersih. `pnpm check`: 0 error dan 115 warning lama di 35 file. Build produksi lokal berhasil; tidak membuat installer, rilis, atau push GitHub.
- 13 kelompok QA integrasi/browser lulus pada database salinan. Lebar 1366, 1024, 768, 390, dan 320 px diuji, termasuk pergantian tab, detail HP, pagination, filter status/nama/sumber, keadaan kosong, sumber hilang, mode gelap, refresh lintas sesi, offline, dan respons terlambat.
- QA 5152: `tmp/monitoring-qa-fJCjgo/result.json`. QA final 5165: `tmp/monitoring-qa-FOTDnf/result.json`, dengan screenshot tambahan daftar HP/tablet. SQLite salinan: integritas `ok`, foreign key bersih.
- Server Vite 5152 dikembalikan dan `/login` terverifikasi HTTP 200; monitoring tanpa sesi mengarah ke login (303). Port produksi 1206 tidak dioperasikan.
