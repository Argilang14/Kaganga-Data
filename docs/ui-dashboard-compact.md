# Dashboard: panel rapat dan informasi harian

## Lingkup

Penyempurnaan lanjutan dari `ui-dashboard-school-identity.md`, 28 Oktober 2026.
Hanya dashboard beserta API pembacaan datanya yang berubah. Sidebar, navbar,
login, database dan alur pencatatan absensi tidak didesain ulang.

## Susunan

- Banner dan statistik lebih ringkas, dengan jarak antarpanel 12px.
- Pada konten minimal 980px, dua kolom mengalir sendiri. Panel berikutnya tidak
  menunggu panel tetangga yang lebih tinggi.
- Kolom utama memuat grafik, absensi dan pengawasan kelas.
  Kolom pendamping memuat tindakan cepat, jadwal, prestasi, pengumuman dan
  kelengkapan data.
- Dua panel penilaian ditempatkan berdampingan di baris bawah, agar kolom utama
  tidak jauh lebih panjang daripada kolom pendamping.
- Pada layar kecil, panel menjadi satu kolom: grafik, absensi, tindakan cepat,
  jadwal, pengawasan kelas, prestasi, pengumuman, lalu ringkasan lainnya.
- Enam tindakan cepat yang tersedia menggantikan susunan tujuh tombol yang
  sebelumnya memuat placeholder Export Dapodik. Izin backup/import tetap sama.
- Grafik tanpa catatan memakai pesan ringkas, bukan bidang grafik kosong.

## Data dan akses

`GET /api/dashboard/trend` mengembalikan agregat tujuh hari kalender sampai hari
ini. Sumbernya sama dengan pilihan masuk sekolah pada dashboard. Perhitungan
memakai loader monitoring yang sudah menangani sakit, izin pulang, kehadiran
dan penugasan. Tidak mengirim nama atau identitas murid.

Persentase adalah murid hadir (termasuk terlambat) dibagi murid aktif dalam
cakupan. Tanggal tanpa catatan memiliki nilai `null`, bukan 0% atau alfa.
Hari yang hanya memuat ketidakhadiran tercatat boleh bernilai 0%.
Rincian tanggal tersedia melalui tabel yang dapat dibuka dengan keyboard.

Cakupan adalah roster aktif semester berjalan, bukan rekonstruksi jumlah murid
yang terdaftar pada masing-masing tanggal lampau. Periode tujuh hari termasuk
hari libur; tanggal tanpa catatan tidak dihubungkan dengan garis perkiraan.

Grafik mengikuti filter pimpinan dan penugasan absensi. Akun tim dapur tidak
mendapat grafik kehadiran sekolah. Respons bersifat `private, no-store`; tidak
ada cache global lintas akun atau sekolah. Pengambilan ulang dibatalkan ketika
akun/konteks halaman berubah dan tombol dinonaktifkan selama pemuatan.

Jadwal harian mengaktifkan data agenda yang sebelumnya sudah disiapkan loader
dashboard, lalu menambahkan nama mapel/kegiatan dan guru dari relasi jadwal.
Kelas mengikuti cakupan akademik akun. Lima slot ditampilkan dahulu, maksimal
20 slot dari loader; tombol jadwal lengkap hanya ada bagi akun yang berhak.

Pengumuman hanya memuat judul yang aktif dan sedang berlaku. Audiens mengikuti
role/izin pengelolaan pengumuman. Pengumuman mendatang, kedaluwarsa dan nonaktif
tidak ditampilkan, termasuk pada kartu dashboard admin. Agenda kalender memakai
batas sekolah, tahun, semester dan cakupan kelas yang sudah ada pada loader.

Tidak menambah dependency, tabel atau migrasi. Fitur cetak dan peringkat rapor
tidak berubah. Penilaian kehadiran konsisten tetap hanya memakai masuk sekolah.

## Pengujian

- Unit test dashboard, tren dan akses menu: 25 lulus.
- `pnpm check`: 0 error; 116 peringatan lama dalam 35 file.
- `scripts/qa-dashboard-ui-copy.mjs` menjalankan Chrome tersembunyi dan server
  port 5188 dengan salinan SQLite. Fixture akun, jadwal, pengumuman dan absensi
  hanya dibuat di salinan tersebut, tidak pada database sekolah.
- Baseline kontrak absensi dibandingkan tanpa metadata agenda yang baru
  diaktifkan dan waktu pemuatan.
- Ukuran uji: 320, 360, 390, 430, 768, 1024, 1366, 1440 dan 1920px.
- Build dan ESLint terarah lulus. Empat belas kelompok QA browser lulus,
  termasuk retry koneksi, rincian grafik lewat keyboard, dialog, pagination,
  filter, mode gelap dan pembatasan audiens/penugasan/sekolah. Tidak ada galat
  JavaScript atau overflow horizontal halaman.
- Jarak panel desktop terukur 12px dan selisih tinggi dua kolom kurang dari
  200px pada fixture terisi. Banner desktop turun dari 180px menjadi 142,8px.
- Ukuran dan font kartu login tetap sama dengan baseline.
- Baseline: `tmp/dashboard-ui-before-1793162354446/`. Hasil akhir:
  `tmp/dashboard-ui-after-1793166703496/`. Artefak berisi salinan data sekolah
  dan dikecualikan Git; tidak untuk diunggah ke repositori.
- Server lokal 5152 memakai build final dan `/login` mengembalikan HTTP 200.
  Port 1206 tidak disentuh. Tidak membuat rilis atau push GitHub.

Uji perangkat fisik dan kenyamanan pembacaan dengan variasi penugasan nyata
tetap diperlukan. Backup/import sungguhan tidak dijalankan dalam QA dashboard.
