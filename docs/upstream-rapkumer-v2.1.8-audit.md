# Audit Rapkumer v2.1.8 untuk Kaganga

Tanggal pemeriksaan: 24 Oktober 2026. Tahap 1 sampai 3 selesai: inventaris perubahan,
perbandingan dengan Kaganga, serta backup dan pemeriksaan awal. Belum ada penerapan
fitur upstream, migrasi database, perubahan izin, pembaruan versi, push, atau rilis.

## Sumber dan batas pemeriksaan

- Kaganga: versi `2.2.7`, branch `codex/release-v2.2.7`.
- HEAD lokal: `2b028023fc8cc5b75fab91cc3fdfeed26e403470`.
- Dasar perbandingan Rapkumer: `c8700c76719cda07955e039723af3e0e5fe470d4`.
- Upstream yang diperiksa: `1df6d3593d689466f3549f11a3130180652cf888`.
- [Rilis Rapkumer v2.1.8](https://github.com/sira313/rapkumer/releases/tag/v2.1.8).
- [Perbandingan sumber](https://github.com/sira313/rapkumer/compare/c8700c76719cda07955e039723af3e0e5fe470d4...1df6d3593d689466f3549f11a3130180652cf888).

Ada empat commit baru: `eda3bcd` (kop, tanda tangan, dan stempel), `7e1e1bf`
(keasramaan), `110f24d` (2.1.8), dan `1df6d35` (versi).
Selisih mentah mencakup 189 berkas, 7.619 baris tambahan, dan 3.397 baris hapus.
Empat berkas seluruh perubahannya hilang jika perbedaan spasi diabaikan.
Berkas lain dapat mencampur formatting, pembenahan tipe, dan perubahan perilaku.

Inventaris seluruh berkas tersimpan dalam backup. Pemeriksaan manual berfokus pada
modul jadwal, impor nilai, keasramaan, akses pengguna, kop, dan aset cetak.
Ini bukan pemeriksaan manual lengkap atas semua perubahan di 189 berkas.
Kode Kaganga yang belum di-commit ikut dibandingkan dan dipertahankan.

## Keputusan per fitur

| Perubahan upstream                       | Keadaan Kaganga                                                                                 | Keputusan                                          |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| Nilai tengah semester saat impor sumatif | Kolom dan hitungan manual sudah ada; jalur impor belum menulis `nilaiAkhirRts`                  | Kandidat perbaikan fungsi pertama                  |
| Batas jam pulang jadwal publik           | Route publik upstream tidak ada di Kaganga; jadwal tiga jenjang memakai jalur tersendiri        | Reproduksi kasus Kaganga dahulu                    |
| Rekap dan leger keasramaan               | Sudah ada, tetapi pembobotan rata-ratanya berbeda                                               | Pertahankan rumus Kaganga                          |
| Akun dan akses Wali Asrama               | Sudah ada beserta penugasan dan jabatan akses                                                   | Jangan menyalin aturan role upstream               |
| Kop gambar, tanda tangan, dan stempel    | Belum ada pengaturan aset generik yang setara; kop dinamis dan identitas tiga jenjang sudah ada | Adaptasi terpisah setelah audit izin dan identitas |
| Parser Excel Wali Asuh                   | Upstream menambah alias kolom dan mempertahankan nilai lama saat input kosong                   | Kandidat terpisah dengan uji identitas murid       |
| Impor absensi upstream                   | Memakai tabel absensi lama, berbeda dari alur kegiatan Kaganga                                  | Tunda; jangan salin langsung                       |
| Dapodik SMA dan jenis mapel SMK          | Ada batas penulisan Dapodik untuk sekolah terintegrasi di Kaganga                               | Di luar penerapan awal                             |
| Lampiran generator RPM                   | Catatan rilis masih menyebut belum diperbaiki                                                   | Jangan menjanjikan perbaikan                       |

### Impor nilai sumatif

Di upstream, `src/routes/api/asesmen-sumatif/import/+server.ts` menambahkan
perhitungan `nilaiAkhirRts` pada insert dan pembaruan data yang sudah ada.
Nilai ini memakai lingkup materi dan STS, tanpa SAS. Bobot sekolah digunakan,
dengan nilai bawaan 70/30; komponen yang tersedia dinormalisasi kembali.

Jalur impor Kaganga saat ini hanya menulis `nilaiAkhir`. Perhitungan RTS sudah
ada di `src/routes/(input-nilai)/asesmen-sumatif/formulir-asesmen/+page.server.ts`.
`src/lib/server/db/schema.ts` juga sudah memiliki bobot RTS dan `nilaiAkhirRts`.
Perbaikan ini tidak memerlukan penambahan kolom tersebut.

Penerapan berikutnya harus menyamakan hasil impor dengan pengisian manual,
menguji bobot khusus, nilai nol, komponen kosong, impor ulang, dan pembatasan
murid/mapel/kelas/semester. Nilai SAS tidak boleh ikut menghitung RTS.
Data lama tidak dihitung ulang massal tanpa pemeriksaan dan persetujuan terpisah.

### Jadwal pelajaran

Perubahan fungsi upstream di `src/routes/jadwal-pelajaran/+page.svelte` mencari
posisi `PLG` tersimpan sebelum memakai jam pulang otomatis. Ini menyangkut
batas tampilan jadwal publik, bukan perbaikan umum pemeriksaan bentrok atau PDF.
Route publik tersebut tidak ada pada Kaganga.

Kaganga memakai `src/routes/(informasi-umum)/rapor/jadwal-pelajaran/+page.svelte`
untuk jadwal tiga jenjang, dengan helper slot, segmen, JP, dan server jadwal.
Jalur akademik lama juga sudah memiliki perhitungan posisi pulang.
Perubahan `$state` dan `$effect` menjadi `$derived` di upstream adalah
pembenahan reaktivitas yang perlu dinilai pada jalur yang benar.

Cetak jadwal Kaganga memiliki template dan sumber preview tersendiri.
Monitoring kelas juga terhubung ke jadwal. Semua jalur itu harus tetap bekerja;
menyalin halaman upstream tidak membuktikan masalah cetak Kaganga selesai.

### Rekap keasramaan dan akses

Kaganga sudah memiliki `src/routes/(input-nilai)/rekap-nilai-asrama/` serta
`src/lib/components/AsramaLegerDownload.svelte`. Rekap menghitung nilai tiap
matev melalui `hitungNilaiIndikator`, lalu merata-ratakan matev yang terisi.
Upstream merata-ratakan seluruh nilai TP valid untuk rata-rata keseluruhan.

Contoh: matev A memiliki satu TP bernilai 4; matev B memiliki tiga TP bernilai 2.
Hasil Kaganga adalah `(4 + 2) / 2 = 3`; hasil pembobotan TP upstream adalah
`(4 + 2 + 2 + 2) / 4 = 2,5`. Penggantian rumus dapat mengubah peringkat.
Karena itu, jangan menambahkan rekap paralel atau mengganti rumus sebagai
bagian dari perapihan UI.

Role Wali Asrama, akun massal, jabatan akses, dan pembatasan penugasan sudah ada.
Kaganga memakai pemetaan menu, guard terpusat, serta validasi sasaran keasramaan.
Nama izin upstream tidak selalu sama; endpoint keasramaan Kaganga memakai
`keasramaan_input` melalui pemetaan aksesnya.

Akses absensi Wali Asrama yang sengaja mencakup murid aktif sekolah harus
dibedakan dari cakupan penilaian keasramaan. Jangan menyalin pembuatan akun
otomatis, penimpaan izin bawaan saat login, atau whitelist tipe pengguna dari
upstream. Uji lintas-role, kelas palsu, dan ID murid diperlukan sebelum perubahan.

### Kop dan aset tanda tangan

Upstream menambahkan kop portrait/landscape dan gambar tanda tangan/stempel PNG
di luar SQLite. Kaganga sudah memiliki identitas cetak per satuan pendidikan,
NPSN SD/SMP/SMA, serta identitas induk untuk dokumen seluruh jenjang melalui
`src/lib/server/education-units.ts` dan `src/lib/school-print-format.ts`.

Adaptasi harus menetapkan prioritas aset induk dibanding aset tiap jenjang,
mempertahankan kop dinamis sebagai fallback, dan tidak mengubah seluruh PDF
sekaligus. Tanda tangan dan stempel tetap opsional sesuai jenis dokumen dan izin.
Gambar tanda tangan bukan pengganti alur persetujuan dokumen.

Route unggah upstream memeriksa MIME PNG lalu menulis berkas. Sebelum dipakai
di Kaganga, periksa isi gambar, ukuran berkas/piksel, penggantian atomik, izin,
dan cakupan sekolah. Identitas tanda tangan guru berbasis akun di upstream juga
perlu disesuaikan dengan pegawai dan akun multi-role Kaganga.

### Batas integrasi lain

Parser Excel upstream memisahkan pembacaan header, menerima `Wali Asuh` dan
`Nama Wali Asuh`, serta mempertahankan wali lama jika nilai baru kosong.
Impor Kaganga memiliki pemetaan `unitNpsn` dan perlindungan identitas sendiri.
Adaptasi parser tidak boleh mengganti mekanisme NISN atau identitas tiga jenjang.

Impor absensi upstream menulis `tableAbsensi` dan `tableKetidakhadiranHarian`.
Jangan menganggap data itu otomatis masuk ke QR kegiatan, monitoring sekolah dan
asrama, atau pencegahan scan ganda Kaganga. Status belum tercatat harus tetap
dibedakan dari alfa.

Penambahan penyimpanan passkey buku tamu dalam teks biasa tidak diambil.
Instruksi agen, dependency, versi aplikasi, dan perubahan lint lintas-modul
upstream juga tidak diterapkan pada tahap ini.

## Backup lokal terverifikasi

Lokasi relatif terhadap root proyek:

```text
dist/backups/upstream-review-2026-10-24T15-48-24-393Z/
```

Folder ini diabaikan Git dan tidak untuk diunggah ke GitHub. Isinya dapat memuat
data pribadi dan konfigurasi privat. Backup hanya mencakup laptop lokal ini,
bukan PC server sekolah. Backup pada disk yang sama belum melindungi dari
kerusakan atau kehilangan disk; salinan eksternal terenkripsi tetap diperlukan.

| Pemeriksaan                 | Hasil                                                                             |
| --------------------------- | --------------------------------------------------------------------------------- |
| Snapshot kode               | 1.188 berkas, termasuk perubahan belum di-commit dan berkas baru nonignored       |
| Riwayat Git                 | `history.bundle` dibuat dan lulus `git bundle verify`                             |
| Patch lokal                 | Patch terhadap HEAD, staged, unstaged, dan status Git tersimpan                   |
| Inventaris upstream         | 189 berkas beserta diff mentah dan diff pengabaian spasi                          |
| Database                    | Salinan konsisten SQLite melalui `VACUUM INTO`, termasuk keadaan WAL secara logis |
| Ukuran salinan database     | 2.113.536 byte; 115 tabel                                                         |
| Integritas database         | `ok`                                                                              |
| Pelanggaran foreign key     | 0                                                                                 |
| Foto/lampiran/suara         | Akar penyimpanan lama dan baru diperiksa; 4 berkas, 614.740 byte tersalin         |
| Salinan pemulihan terpisah  | Hash database, integritas, jumlah baris tabel, dan hash aset cocok                |
| Keadaan kode setelah backup | HEAD, hash berkas sumber, dan status working tree tidak berubah                   |

`manifest.json` mencatat hash SHA-256, pemetaan akar aset, lokasi yang tidak ada,
serta hasil pemeriksaan. Foto/lampiran dan konfigurasi privat berada di folder
terpisah dari database. Snapshot kode tidak menyalin dependency atau build output.

Uji pemulihan dilakukan pada salinan terpisah, tidak menimpa database aktif.
Ini belum merupakan uji instalasi ulang dan pemulihan aplikasi penuh.
Sebelum pemulihan nyata, hentikan proses server yang telah diidentifikasi,
siapkan direktori terpisah, pulihkan riwayat dan snapshot kode, lalu database
serta aset sesuai manifest. Periksa konfigurasi dan identitas server sebelum
menjalankan aplikasi secara terisolasi. Jangan menyalin identitas server ke dua
server produksi yang berjalan bersamaan.

## Pemeriksaan awal

Tujuh berkas pengujian bawaan dijalankan dengan `node --test`:

```text
src/lib/jadwal-segments.test.ts
src/lib/jadwal-slots.test.ts
src/lib/jadwal-jp.test.ts
src/lib/role-menu-access.test.ts
src/lib/user-role.test.ts
src/lib/access-position.test.ts
src/lib/education-unit.test.ts
```

Hasil: 38 pengujian lulus, 0 gagal. Pengujian ini tidak membuktikan seluruh alur
impor, PDF, atau izin endpoint sudah benar. Tidak ada build baru, pemeriksaan
Svelte menyeluruh, penghitungan ulang nilai, atau perubahan UI pada tahap audit.

## Kelanjutan yang disarankan

1. Reproduksi kasus pada database uji dan tentukan kontrak hasil yang diharapkan.
2. Perbaiki RTS pada impor sumatif dengan mengacu pada rumus manual Kaganga.
3. Uji jadwal pada jalur Kaganga; ambil perbaikan upstream hanya jika relevan.
4. Rancang kop dan aset tanda tangan per satuan pendidikan secara terpisah.
5. Periksa akses keasramaan tanpa mempersempit hak jabatan atau memperluas nilai
   ke murid di luar cakupan yang diizinkan.

Langkah lanjutan tersebut belum dikerjakan. Tidak dilakukan merge atau
cherry-pick upstream ke aplikasi Kaganga.
