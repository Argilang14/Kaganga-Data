# Audit SIAP SR dan rencana integrasi Kaganga

Tanggal pemeriksaan: 25 Oktober 2026.

Situs: https://eabsensi.srt-03bengkulu.workers.dev/

## Ringkasan keputusan

SIAP SR memiliki alur pengasuhan yang dapat melengkapi Kaganga, terutama laporan piket per shift, pemantauan anak sakit, dan riwayat perkembangan anak. Integrasi bertahap melalui API layak diteliti lebih lanjut. Kesiapan backend untuk integrasi produksi belum dapat dipastikan.

Rekomendasi awal: Kaganga tetap menjadi sumber identitas murid, kelas, semester, dan satuan pendidikan. SIAP SR tetap menjalankan operasional pengasuhan selama uji coba. Tampilkan ringkasan baca-saja di Kaganga sebelum mengizinkan pertukaran catatan absensi.

Jangan menyatukan database, memindahkan seluruh data, menyamakan akun, atau menyalin status absensi secara otomatis pada tahap pertama.

## Batas pemeriksaan

- Login menggunakan akun yang diizinkan pengguna. Akun terbaca sebagai role `admin2`.
- Menelusuri 18 halaman dari 23 menu yang terlihat, membaca kode frontend yang dikirim situs, dan mengamati respons API baca.
- Browser audit hanya mengizinkan GET/HEAD dan POST login. Permintaan mutasi lain diblokir oleh pengaman lokal; selama penelusuran tidak ada permintaan mutasi lain yang dicoba.
- Tidak melakukan scan, menyimpan formulir, mengubah pengguna, menghapus data, mengunggah berkas, menandatangani, mencetak, atau mengekspor dokumen.
- Login membuat sesi autentikasi normal; pencatatan login di backend tidak diperiksa.
- Tidak menguji kamera, pengenalan wajah, keunikan scan lintas perangkat, otorisasi setiap role, pemulihan backup, atau keamanan backend.
- Tidak memperoleh kode Worker, skema database, atau konfigurasi deployment. Domain Workers tidak membuktikan jenis penyimpanan database.
- Bukti lokal tidak memuat kata sandi. Tangkapan layar dashboard yang dipakai untuk pemeriksaan visual telah disamarkan pada bagian identitas pribadi.

## Komponen yang ditemukan

| Kelompok | Menu dan fungsi yang terlihat |
| --- | --- |
| Beranda | Ringkasan murid, pendampingan, perkembangan positif, dan tindak lanjut |
| Absensi | Scan QR, absensi manual/massal, antarmuka pengenalan wajah, dan rekap |
| Perizinan | Izin keluar/pulang, scan gerbang, izin sekolah, dan izin berobat |
| Pengasuhan | Lapor Kejadian, Laporan Guru, Pantau Sakit, Aktivitas Sanksi, dan Catatan Anak |
| Piket | Laporan per shift, ringkasan kejadian/absensi, dokumentasi, dan kasus belum selesai |
| Profil anak | Gabungan riwayat absensi, izin, laporan, dan perkembangan |
| Pelaporan | Rekap Laporan dan Rapor Asrama |
| Asrama | Ringkasan, data murid, ruang, sarpras, pengajuan, barang rusak, dan inspeksi kamar |
| Data master | Siswa, Upload Excel, Kegiatan, dan Pengguna |
| Pendukung | TTD Saya dan Pengaturan |

Data yang terlihat pada akun ini mencakup 102 murid asrama putra: 44 SMP dan 58 SMA. Ini adalah cakupan data yang terlihat, bukan jumlah seluruh murid sekolah. API kegiatan mengembalikan sembilan kegiatan.

Frontend memakai HTML/CSS/JavaScript, Tailwind CDN, dan CSS khusus. Pustaka yang terlihat mencakup Font Awesome, html5-qrcode, face-api, xlsx, qrcode-generator, dan pdfmake. Ini bukan frontend DaisyUI/Svelte yang dapat langsung ditempel ke Kaganga.

Pada halaman yang ditelusuri tidak tercatat galat JavaScript. Dashboard pada lebar 390 px tidak meluap secara horizontal setelah transisi sidebar selesai. Pemeriksaan ini tidak membuktikan seluruh formulir dan tabel sudah lolos uji responsif atau aksesibilitas.

## Temuan sebelum integrasi

### 1. Kegiatan gabungan tidak sama dengan dua bukti kehadiran

Kegiatan SIAP SR mencakup "Sarapan + Apel Pelepasan Siswa" dan "Sholat Isya + Apel Malam". Satu scan pada kegiatan tersebut tidak boleh otomatis menghasilkan dua catatan independen di Kaganga.

Daftar kegiatan lain yang terlihat: Makan Siang, Kebersihan Asrama Pagi, Kebersihan Asrama Sore, Sholat Subuh, Sholat Dzuhur, Sholat Ashar, dan Sholat Magrib. Jangan menganggap kegiatan yang tidak ada dalam daftar sudah dipantau.

Keberangkatan dari asrama juga tidak membuktikan murid telah tiba di sekolah. Pertahankan peristiwa perjalanan yang terpisah.

### 2. QR dan identitas murid berbeda

QR murid SIAP SR dibuat dari NIS. Kaganga memverifikasi token QR melalui hash dan pemeriksaan konteks murid, termasuk masa berlaku atau pencabutan token. QR keduanya belum saling kompatibel.

Respons `/api/siswa` yang diamati memiliki ID, NIS, NIK, jenjang, kelas, asrama, dan ruang. NISN tidak terlihat pada respons tersebut. NIK tidak boleh diperlakukan sebagai NISN.

Gunakan tabel pemetaan `sumber + ID murid eksternal -> schoolId + identityUid Kaganga`. Hubungkan ke baris semester yang sesuai saat membaca atau menulis data. Cocokkan NIS dan jenjang, lalu tinjau hasilnya; jangan mencocokkan berdasarkan nama saja.

Murid yang tidak muncul dalam data SIAP SR tidak boleh dihapus, dinonaktifkan, atau dianggap tidak hadir di Kaganga.

### 3. Arti status absensi perlu disepakati

Frontend menggunakan beberapa kelompok status, antara lain `hadir`, `telat`, `izin`, `tidak_hadir`, serta `sakit`, `alpa`, dan `diluar` pada alur tertentu. Kaganga memiliki aturan status dan proyeksi izin sendiri.

`telat` dapat dipetakan ke `terlambat` setelah aturan jam disepakati. `tidak_hadir` atau belum ada scan tidak boleh otomatis menjadi `alfa`. `diluar` memerlukan penjelasan apakah berarti izin kegiatan atau benar-benar pulang ke rumah.

Pada formulir massal, pilihan yang belum disentuh menggunakan nilai bawaan Hadir. Pola ini tidak cocok untuk menyimpulkan kehadiran dari daftar QR yang belum terscan. Keunikan pencatatan lintas perangkat belum diuji.

### 4. Persetujuan izin berbeda dari keluar gerbang

SIAP SR menampilkan persetujuan wali asuh/wali asrama, penjemput, serta catatan keluar/kembali gerbang. Kaganga sudah mempunyai izin pulang dan peristiwa perjalanan.

Status Pulang sebaiknya mengikuti bukti keluar yang sah sesuai kebijakan sekolah, bukan hanya persetujuan permohonan. Kepulangan dan kedatangan harus mempertahankan waktu aktual serta petugas yang memindai.

### 5. Nama role tidak dapat disalin langsung

Pada frontend SIAP SR, `admin` berarti Wali Asrama dan `admin2` berarti Admin. Role lain mencakup wali asuh, guru, dan satpam. Penamaan ini berbeda dari Kaganga.

Pemetaan akun harus berdasarkan identitas pegawai dan daftar izin, bukan kesamaan username atau string role. Pemeriksaan satu akun ini belum membuktikan pembatasan backend pada seluruh role.

### 6. Data pengasuhan memerlukan akses terbatas

Pemantauan sakit, catatan psikososial, sanksi, dan informasi penjemput tidak perlu tampil pada semua pengguna. Batasi data sesuai tugas; jangan menyalin data wajah pada integrasi awal.

Fitur TTD QR memanggil endpoint yang membuat catatan tanda tangan. Ini tidak diperiksa melalui tindakan cetak/tanda tangan dan tidak dinilai sebagai tanda tangan elektronik tersertifikasi.

Antarmuka pengaturan memiliki reset data berskala luas. Jangan menyalin pola reset tersebut ke integrasi. Penghapusan sumber tidak boleh langsung menghapus data Kaganga.

## Perbandingan dan fitur yang layak diadopsi

| Fitur SIAP SR | Kondisi Kaganga yang diperiksa | Saran |
| --- | --- | --- |
| Absensi dan scan QR | Sudah ada token QR, kegiatan, monitoring, dan rekap | Pertahankan mesin Kaganga; sepakati penanggung jawab pencatatan tiap kegiatan |
| Izin dan gerbang | Sudah ada izin pulang, penjemput, serta keluar/kembali | Hubungkan peristiwa, hindari membuat dua izin untuk kejadian yang sama |
| Laporan piket per shift | Data absensi dan tindak lanjut dapat menjadi bahan laporan | Prioritas adopsi: laporan serah terima dengan kasus belum selesai |
| Pantau Sakit | Ada indikator kehadiran dan data kesehatan; berbeda dari riwayat sakit harian | Tambahkan episode sakit dan pembaruan sampai pulih dengan akses terbatas |
| Buku perkembangan | Ada Catatan Wali Asrama dan tindak lanjut absensi | Perluas menjadi riwayat bertanggal, aspek, petugas, status, dan tindak lanjut |
| Rapor Asrama berbasis bukti | Ada penilaian keasramaan dengan rubrik tersendiri | Bukti menjadi usulan, tidak otomatis menimpa nilai; samakan rubrik dahulu |
| Ruang dan sarpras asrama | Ada inventaris | Hubungkan lokasi/ruang dan inspeksi ke aset yang sama |

Laporan piket menggunakan tiga shift: 07:01-15:00, 15:01-23:00, dan 23:01-07:00. Saat diintegrasikan, bedakan tanggal shift dan waktu kejadian aktual, khususnya shift lintas tengah malam.

## Rancangan hubungan yang disarankan

```text
Kaganga: identitas, kelas, semester, satuan pendidikan, kebijakan akses
                 |
                 | pemetaan identitas yang telah diperiksa
                 v
SIAP SR: operasional pengasuhan yang disepakati selama uji coba
                 |
                 | API baca terbatas, ditarik oleh server Kaganga
                 v
Kaganga: ringkasan eksternal dengan sumber dan waktu pembaruan
```

API internal browser sudah terlihat, misalnya `/api/siswa`, `/api/kegiatan`, `/api/dashboard`, `/api/perkembangan`, `/api/pantau-sakit`, dan `/api/laporan-piket/data`. Keberadaan endpoint tersebut belum membuktikan tersedia API integrasi resmi, token layanan, webhook, atau penarikan perubahan bertahap.

Untuk uji awal, server Kaganga dapat menarik data keluar menuju Worker. Jangan mengandalkan Worker mengakses alamat LAN PC sekolah. Saat internet putus, tampilkan waktu pembaruan terakhir dan status data tersimpan, bukan menganggap data masih terkini.

Gunakan kredensial layanan terbatas yang disimpan di server. Jangan memakai kata sandi admin, berbagi cookie browser, atau menaruh rahasia API pada frontend. Tautan/iframe hanya membuka aplikasi; itu bukan sinkronisasi data atau SSO.

Jika tahap baca berhasil, setiap peristiwa yang dipertukarkan perlu ID sumber, versi perubahan, identitas murid, kegiatan, waktu aktual, dan petugas. Pengiriman ulang tidak boleh menggandakan catatan. Konflik dengan catatan manual terverifikasi masuk daftar pemeriksaan, bukan ditimpa berdasarkan waktu kirim terakhir.

## Urutan pengembangan yang diusulkan

1. Minta kode Worker, skema data, dokumentasi backup, dan izin teknis dari pembuat SIAP SR.
2. Tetapkan sumber utama setiap jenis data dan satu aplikasi pencatat untuk tiap kegiatan.
3. Periksa pemetaan identitas murid, jenjang, kelas, akun, dan izin akses.
4. Sepakati arti kegiatan gabungan, status, izin, serta waktu shift.
5. Sediakan API baca khusus integrasi dengan akses minimum dan catatan akses.
6. Uji ringkasan baca-saja pada satu asrama: laporan piket, anak sakit, dan tindak lanjut.
7. Bandingkan hasil kedua aplikasi, termasuk data kosong, koreksi, keterlambatan, dan jaringan putus.
8. Putuskan fitur yang dipindahkan ke Kaganga dan fitur yang tetap dikelola SIAP SR.
9. Baru pertimbangkan pertukaran absensi dan kompatibilitas QR dengan pencegahan duplikasi.
10. Bahas SSO setelah identitas dan izin stabil. Tidak ada sinkronisasi database dua arah pada tahap awal.

## Bukti dan pemeriksaan lanjutan

Bukti lokal berada di `tmp/siap-sr-readonly-audit-2026-10-25/` dan `tmp/siap-sr-readonly-mobile-2026-10-25/`. Inventaris privat tidak untuk dipublikasikan. Snapshot frontend: `tmp/siap-sr-audit-2026-10-25.html`. Berkas tersebut merupakan bukti kerja lokal, bukan bagian aplikasi.

Pembanding Kaganga: `src/lib/server/absensi-digital.ts`, `src/routes/api/administrasi/absensi/scan/+server.ts`, `src/lib/server/attendance-permits.ts`, dan `src/lib/server/db/schema.ts`.

Belum diperiksa: backend Worker, penyimpanan kata sandi, penerapan izin di server, CORS/CSRF, batas percobaan login, enkripsi/retensi data, kapasitas, transaksi scan serentak, dan pemulihan backup. Tidak ada kesimpulan keamanan menyeluruh dari audit ini.

Kredensial audit yang diberikan sederhana. Pemilik sebaiknya menggantinya setelah penelusuran selesai; auditor tidak mengubahnya.

Audit ini hanya menambahkan laporan. Tidak ada perubahan fungsi, database, server, atau rilis Kaganga.
