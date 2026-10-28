# Cetak Informasi Siswa: tahap 8-12

## Acuan dan lingkup

Acuan visual dokumen: contoh Informasi Murid dari pengguna, bukan background siap pakai. A4 landscape, satu murid per halaman; foto utama dan tambahan di kiri, informasi keluarga di tengah, alamat/asrama/pendataan di kanan. Background kustom diunggah per pembuatan PDF, tidak disimpan sebagai foto murid atau dipakai otomatis pada cetakan lain.

Acuan kontrol: **Fallback Kaganga**, `ClassQrPrint.svelte`, cabang QR Kelas pada `CetakSR.svelte`, serta ukuran kontrol Data Murid yang telah diperiksa. Tidak ada klaim pengukuran Rapkumer upstream baru. Pilihan dokumen dan panel mempertahankan struktur halaman cetak yang ada; implementasi baru dibatasi pada panel Informasi Siswa.

| Elemen          | Sumber lokal             | Ukuran/perilaku                                 |
| --------------- | ------------------------ | ----------------------------------------------- |
| Pilihan dokumen | CetakSR, panel QR Kelas  | Select selebar area kerja                       |
| Input/select    | Data Murid, ClassQrPrint | Tinggi 40 px, satu kolom di HP                  |
| Form cetak      | ClassQrPrint             | Grid dua kolom mulai sm, tombol membungkus      |
| Pratinjau       | ClassQrPrint             | PDF di bawah kontrol; tautan unduh setelah siap |
| Dokumen         | Contoh pengguna          | A4 297 x 210 mm, satu murid per halaman         |

## Pemetaan tahap

8. Pilihan dokumen, konteks kelas dan murid sesuai izin.
9. Komposisi profil/foto, data kosong dan penyamaran NIK/KK bawaan.
10. Template A4 landscape dan background gambar kustom.
11. Pratinjau dan unduh satu murid atau murid sekelas dalam cakupan akun.
12. Uji izin, regresi, tata letak PDF, serta desktop/HP.

Data profil menggunakan kondisi terkini, bukan riwayat sosial per tanggal. Kondisi fisik/perlengkapan tetap dari catatan kesehatan terbaru yang tidak melewati hari cetak. Cetak memerlukan izin Cetak Dokumen dan `murid_profil_cetak`; izin baca/kelola profil saja tidak cukup. Tidak memperluas penugasan wali.

NIK/KK disamarkan secara bawaan di server sebelum HTML/PDF dibuat. Tampilan penuh hanya atas pilihan eksplisit pengguna berizin. Audit mencatat jumlah halaman dan pilihan penyamaran, bukan isi identitas, alamat atau catatan pribadi.

Background kustom maksimal 5 MB, JPG/PNG/WebP, melalui dekoder foto aman yang sudah digunakan profil. Berkas hanya diproses untuk request tersebut. Seluruh gambar dokumen berupa data URI internal; tidak mengambil gambar dari URL jaringan. PDF tidak memakai cache bersama, disajikan `private, no-store`.

## Validasi 27 Oktober 2026

- `pnpm check`: 0 galat, 117 peringatan pada 36 berkas. Peringatan tidak ditangani melalui refactor di luar lingkup fitur ini.
- `pnpm build`: berhasil, termasuk adapter Node.
- Uji unit cetak/template/izin: 14 lulus; pemeriksaan gabungan profil, foto, form, izin pengguna, dan cetak: 38 lulus. Lint terarah komponen, API, template, dan skrip QA lulus.
- Uji layanan pada salinan database: 12 kelompok lulus, termasuk migrasi profil, pemisahan izin, cakupan wali, audit tanpa data pribadi, dan PDF sesungguhnya.
- Empat PDF diuji: satu murid, sekelas (dua murid sintetis), latar putih, serta latar kustom. Jumlah halaman dan ukuran A4 landscape diperiksa; teks PDF diperiksa untuk memastikan NIK/KK lengkap tidak bocor saat disamarkan.
- Hasil PDF dirender ke PNG dan diperiksa secara visual. Foto memakai `object-fit: contain`; foto yang belum ada diberi ruang kosong berlabel, bukan foto pengganti. Isian berlebih menghasilkan 422, bukan pemotongan diam-diam.
- QA browser pada salinan database: tujuh kelompok lulus. Akun hanya-izin-cetak dapat membuat PDF tanpa memperoleh akses API foto/profil. Izin baca saja ditolak untuk cetak. Permintaan tidak sesuai format dan latar kustom tanpa berkas ditolak.
- Pratinjau PDF inline, unduhan, pembatalan tampilan NIK/KK lengkap, unggah latar, serta pengosongan pratinjau setelah pilihan berubah diuji. Screenshot desktop, HP, bagian bawah form HP, PDF di browser, dan tema gelap diperiksa.

Ukuran panel cetak berikut diukur pada browser lokal, bukan diklaim sebagai ukuran Rapkumer upstream:

| Lebar viewport | Lebar panel | Tinggi select | Susunan form | Overflow horizontal |
| -------------- | ----------- | ------------- | ------------ | ------------------- |
| 1920 px        | 1248 px     | 40 px         | Dua kolom    | Tidak               |
| 1440 px        | 1071 px     | 40 px         | Dua kolom    | Tidak               |
| 1366 px        | 997 px      | 40 px         | Dua kolom    | Tidak               |
| 1024 px        | 655 px      | 40 px         | Dua kolom    | Tidak               |
| 768 px         | 687 px      | 40 px         | Dua kolom    | Tidak               |
| 390 px         | 319 px      | 40 px         | Satu kolom   | Tidak               |
| 320 px         | 249 px      | 40 px         | Satu kolom   | Tidak               |

Bukti lokal (berkas QA berisi salinan data, tidak untuk dipublikasikan):

- `tmp/murid-profile-foundation-aYTt6J/`: hasil uji layanan, PDF dan render.
- `tmp/student-profile-ui-1793064983186/`: hasil browser dan pengukuran.
- `tmp/informasi-siswa-print-check.log`, `tmp/informasi-siswa-print-build.log`.

Build baru berjalan pada port 5152. Pemeriksaan HTTP: `/login` 200; API cetak tanpa sesi diarahkan ke login (303). Tidak ada akun atau sesi QA yang dibuat pada database utama.

## Penyesuaian tempat foto

Permintaan lanjutan: proporsi tempat foto mengikuti pas foto. Keempat slot kini memakai rasio 3:4, bukan tinggi tetap 67 mm atau membesar untuk memenuhi sisa kolom. Lebarnya tetap mengikuti kolom cetak yang sudah ada (sekitar 34,5 mm, tinggi 46 mm), jadi rasio pas foto tidak berarti cetakan fisik tepat 3 x 4 cm. Gambar menggunakan `contain` agar tetap utuh; foto asli tidak diubah dan tidak dipotong. Posisi biodata, ukuran A4, dan pembatasan akses tetap.

Regresi terarah: 15 uji unit/template/izin lulus. QA layanan pada database salinan kembali lulus 12 kelompok, termasuk empat PDF aktual, pemeriksaan jumlah/ukuran halaman, penyamaran identitas, dan penolakan isian berlebih. Rasio keempat slot diukur pada setiap mode (foto terisi/kosong, cetak sekelas, putih/kustom), toleransi 0,005 terhadap 3:4. Hasil render diperiksa dari `tmp/murid-profile-foundation-iwzqSt/`; pengukuran disimpan pada `*-photo-frames.json`.

## Perapihan susunan blok cetak

Status hunian, luas tempat tinggal, dan sertifikat rumah dinaikkan ke baris yang sama dengan Perlengkapan Sekolah. Grid baris bersama menjaga posisi sejajar ketika isian biodata berubah; blok foto tetap di atas hunian tanpa bertumpuk. Catatan Petugas tidak lagi mengisi seluruh sisa tinggi kolom: tinggi minimal 12 mm dan bertambah mengikuti isi, sedangkan lebar tetap konsisten dengan kolom alamat/asrama/petugas.

Validasi terarah: 16 uji unit/template/izin dan 12 kelompok QA layanan pada salinan database lulus. Empat PDF aktual tetap berukuran A4 landscape dengan satu murid per halaman. Pengukuran seluruh halaman memastikan selisih posisi atas hunian dan perlengkapan kurang dari 1 px, foto tidak bertumpuk dengan hunian, dan catatan pendek tidak membesar mengikuti tinggi halaman (hasil contoh sekitar 45 px). Isian berlebih tetap ditolak, bukan dipotong. Bukti: `tmp/murid-profile-foundation-Ltv0Fc/`, termasuk `*-sections.json`; render latar biru dan putih diperiksa secara visual.

## Judul foto dan keselarasan garis bawah

Permintaan berikutnya menambahkan judul FOTO MURID di atas kedua pas foto, memakai gaya yang sama dengan judul foto rumah/orang tua. Garis bawah Catatan Petugas kini mengikuti garis bawah Perlengkapan Sekolah. Baris grid mengikuti isi, bukan sisa tinggi halaman A4; panel catatan mengisi ruang kolom kanan sampai batas tersebut. Bagian hunian tetap sejajar dengan bagian atas perlengkapan, dan proporsi foto 3:4 tidak berubah.

Validasi: 17 uji unit/template/izin dan 12 kelompok QA layanan lulus. Pengukuran setiap halaman pada empat mode PDF memeriksa judul berada di atas foto, keselarasan atas hunian/perlengkapan, dan selisih garis bawah catatan/perlengkapan kurang dari 1 px. Contoh memiliki posisi bawah keduanya 672,02 px. PDF tetap satu murid per halaman A4 landscape; konten berlebih tetap ditolak. Bukti lokal: `tmp/murid-profile-foundation-2GOaYC/`, termasuk `*-sections.json`. Render latar biru diperiksa secara visual.
