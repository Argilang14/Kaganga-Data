# Informasi tambahan murid: tahap 5-7

## Lingkup

Tab **Informasi Tambahan** berada di popup **Detail Data Murid**, dengan formulir dan tombol simpan tersendiri. Biodata utama tetap diedit melalui tombol Edit yang lama. Pemisahan ini menjaga akses Wali Asuh yang mendapat izin profil pribadi tanpa memberinya kewenangan mengubah semua biodata utama.

Kelompok isian: keluarga/bantuan sosial, tempat tinggal, asrama/pendataan, sumber kondisi fisik/perlengkapan, serta dokumentasi. Semua isian tambahan opsional. Kelengkapan adalah jumlah data yang tersedia, bukan syarat atau penilaian keluarga. Nilai nol dan pilihan Tidak dihitung sebagai data terisi.

Foto tambahan memiliki tiga slot: murid tambahan, rumah, orang tua/wali. Foto utama tidak diganti. Kandidat foto ditinjau sebelum disimpan; penghapusan membutuhkan konfirmasi. Berkas JPG/PNG/WebP maksimal 5 MB diperiksa isinya lalu didekode browser server, dibatasi 8.000 piksel/sisi dan 32 megapiksel, diubah menjadi JPEG maksimal 1.800 piksel/sisi. Metadata EXIF dan isi berkas asli tidak dipertahankan. Server menggunakan Chrome/Edge yang sudah dipakai untuk PDF; pengolahan foto serentak dibatasi.

Server perlu `BODY_SIZE_LIMIT` minimal `6M` untuk satu foto 5 MB beserta multipart. Installer sudah menyediakan konfigurasi yang lebih besar; batas per foto tetap 5 MB di layanan profil. QA browser memakai `6M` dan foto uji lebih dari 512 KB agar batas bawaan adapter tidak menutupi kendala unggahan.

## Izin dan penyimpanan

Endpoint `/api/murid-profil/[id]` dan `/api/murid-profil/[id]/foto/[kind]` menggunakan pemeriksaan izin khusus, sekolah, pegawai aktif, identitas dan penugasan dari fondasi tahap 1-4. Tidak ada perluasan otomatis akses absensi atau biodata utama. Data dan foto menggunakan `private, no-store`.

Formulir mempertahankan isian saat validasi/koneksi gagal. Setiap simpan dan perubahan foto memeriksa revisi. Konflik menonaktifkan simpan sampai pengguna memuat ulang secara eksplisit. Pembaruan hanya mengirim kolom berubah, sehingga nama petugas lama yang nonaktif tetap tersimpan bila tidak diubah.

Berkas foto baru ditulis ke nama UUID; kegagalan transaksi menghapus berkas baru. Foto yang diganti/dihapus tidak lagi dapat diakses lewat API. Berkas lamanya menunggu pembersihan yatim minimal tujuh hari agar backup yang sedang berjalan masih bisa menyalin referensi snapshot. Backup yang sudah dibuat tetap menyimpan foto sesuai waktu pencadangan.

Backup manual, otomatis bertingkat dan sebelum pemulihan menyertakan folder `<backup.sqlite3>.murid-profil` serta manifest `.murid-profil.json`, dibaca dari metadata database snapshot. Ukuran dan hash berkas diperiksa. Pemulihan database ditolak sebelum transaksi bila foto yang dirujuk belum tersedia/berubah. Untuk pindah perangkat, salin isi folder pendamping tersebut ke `<uploadsDir>/murid-profil/` dengan struktur `sekolah-ID/` tetap utuh, lalu pulihkan database. Simpan database dan folder pendamping sebagai satu paket; keduanya mengandung data pribadi.

Pemeriksaan kesehatan sistem menghitung berkas profil dan yang hilang. Pembersihan aman menghapus hanya berkas tak dirujuk berumur lebih dari tujuh hari. Penghapusan permanen identitas dengan profil tambahan tetap diblokir seperti fondasi; tombol hapus seluruh profil bukan lingkup tahap ini.

## Acuan ukuran

Acuan: **Fallback Kaganga**, kode Data Murid lokal dan pengukuran terdokumentasi di `ui-data-murid-pegawai-audit-2026-10-25.md`; bukan klaim ukuran Rapkumer upstream yang diverifikasi baru.

| Komponen             | Sebelum               | Target tahap 5-7                                   |
| -------------------- | --------------------- | -------------------------------------------------- |
| Popup detail desktop | 672 px, padding 16 px | Tetap 672 px, padding 16 px                        |
| Isi tab              | Padding 16 px         | 12 px ponsel; 16 px mulai sm                       |
| Kolom formulir       | 1-2 kolom             | 1 kolom ponsel; 2 kolom mulai sm                   |
| Input/select         | DaisyUI 40 px         | Tetap 40 px, lebar mengikuti kolom                 |
| Dokumentasi          | Belum tersedia        | 1 kolom ponsel; 3 kolom mulai sm, gambar rasio 4:3 |
| Isian panjang        | Belum tersedia        | Membungkus; textarea dua kolom pada desktop        |

Tahap cetak/PDF, background khusus, dan pemilihan siswa/kelas di Cetak Dokumen belum dikerjakan.

## Pengujian layanan

- 36 uji unit/regresi profil, formulir, akses menu, izin pengguna, skema, backup, dan pemulihan lulus.
- 13 kelompok QA layanan pada salinan database lulus: `tmp/murid-profile-foundation-R4hx4M/results.json`. Termasuk body API null/array/JSON rusak, foto rusak/disamarkan/terlalu besar, revisi lama, akses di luar penugasan, foto utama tetap utuh, salinan dan verifikasi backup, serta masa simpan foto lama dimulai saat penggantian.
- Profil parsial dan profil yang dibuat tanpa isian bantuan memakai default SQL array kosong. Regresi ORM diuji karena default string JSON sebelumnya terenkode dua kali dan ditolak CHECK SQLite.
- Pemeriksaan tipe akhir: 0 error, 117 peringatan lama pada 36 berkas lain (`tmp/informasi-siswa-check-done.log`). Lint berkas fitur lulus; build produksi lulus (`tmp/informasi-siswa-build-json-default.log`).
- Perbaikan popup detail: klik isi/tab tidak lagi dianggap klik latar ketika tinggi popup berubah. Klik latar dengan isian belum tersimpan memerlukan konfirmasi.

## Verifikasi browser

Lima kelompok QA browser/HTTP lulus pada salinan database: `tmp/student-profile-ui-1793034922688/results.json`. Mencakup akses tanpa login/tanpa izin/baca-saja, formulir parsial, KK dengan nol awal, nol dan Tidak, konflik yang mempertahankan draft, muat ulang dengan konfirmasi, foto lebih dari 512 KB, penyimpanan foto dan unduhan privat. Tidak ada galat JavaScript; database salinan lolos `quick_check`.

Pengukuran dari browser (`measurements.json` pada folder yang sama):

| Viewport    | Lebar popup | Tinggi input | Kolom form | Luapan horizontal |
| ----------- | ----------- | ------------ | ---------- | ----------------- |
| 1440 x 1000 | 672 px      | 40 px        | 2          | Tidak             |
| 1366 x 768  | 672 px      | 40 px        | 2          | Tidak             |
| 1024 x 768  | 672 px      | 40 px        | 2          | Tidak             |
| 768 x 1024  | 672 px      | 40 px        | 2          | Tidak             |
| 390 x 844   | 374 px      | 40 px        | 1          | Tidak             |
| 320 x 740   | 304 px      | 40 px        | 1          | Tidak             |

Screenshot desktop, formulir ponsel dan dokumentasi ponsel diperiksa secara visual. Ada pula tangkapan keadaan kosong, konflik dan tema gelap; perpindahan fokus dengan Tab diuji. Foto pada pengujian adalah gambar sintetis, bukan foto murid.

Server lokal dimuat ulang pada port 5152 dengan batas request sesuai konfigurasi Kaganga (`512M`); batas layanan per foto tetap 5 MB. Halaman login memberikan HTTP 200, listener terverifikasi, dan endpoint profil tanpa sesi mengalihkan ke login. Tidak ada rilis/push GitHub pada tahap 5-7.
