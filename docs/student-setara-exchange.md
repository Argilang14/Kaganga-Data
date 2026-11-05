# Impor dan ekspor siswa Setara

Di Akademik/Data Rapor, pilih semester tujuan, pilih file, lalu klik **Pratinjau impor**.
Periksa hasil pencocokan dan pilih baris yang akan disimpan. Baris bermasalah tidak
dapat dipilih. Tombol Simpan pengaturan semester tidak mengimpor file.

## Format

- CSV UTF-8 dengan pemisah titik koma atau koma, serta XLSX. File XLS perlu disimpan
  ulang menjadi XLSX. Batas file 2 MB dan 500 siswa; batas unggahan server tetap berlaku.
- Template dan ekspor memakai 52 kolom Setara dalam urutan aslinya, disusul 15 kolom
  Kaganga. Sheet Petunjuk menjelaskan isian dan aturan pencocokan.
- Format lama menerima alias Nama, NIPD, JK, Rombel, Nama Ibu, dan alamat.
- Nama, tanggal lahir, dan jenis kelamin wajib. Tanggal menerima `dd-MM-yyyy` atau
  `yyyy-MM-dd`; gender menerima L/P atau Laki-laki/Perempuan.
- Nomor identitas disimpan sebagai teks. Tanda `-` berarti kosong. NISN yang hanya
  berisi angka nol juga dianggap belum tersedia. Angka identitas Excel yang berisiko
  kehilangan ketelitian harus diisi ulang sebagai teks.

## Penempatan dan identitas

- Siswa baru mendapat NIS `TMP-…` jika NIS belum ada, lalu masuk Murid Pasif tanpa
  kelas atau asrama. NIS sementara dapat diganti setelah NIS sekolah tersedia.
- Pembaruan siswa lama mempertahankan kelas, asrama, wali asuh, status mutasi, tanggal
  masuk, foto, QR, nilai, serta riwayatnya. Isian kosong tidak menghapus biodata lama.
- Rombongan Belajar disimpan sebagai informasi sumber, termasuk beberapa nama kelas.
  Penempatan dilakukan melalui Murid Kelas atau Murid Asrama.
- UID, NIK, NISN, dan NIS dicocokkan hanya dalam sekolah aktif, dengan pemeriksaan
  nama dan tanggal lahir. Identitas yang ambigu atau bentrok harus diperiksa dahulu.
- Murid pada semester lain perlu diproses melalui salin semester atau kenaikan kelas.
  Impor tidak memulihkan murid pindah, keluar, lulus, atau menunggu pemeriksaan identitas.
- NPSN sumber harus sekolah aktif atau satuan pendidikan yang sudah terdaftar.
- Perubahan NIS untuk identitas yang memiliki beberapa semester perlu melalui koreksi
  identitas agar riwayatnya tetap terhubung.

## Penyimpanan dan pengujian

Biodata umum diperbarui pada data murid, alamat, orang tua, serta profil tambahan
(KK, desil, RT/RW). Seluruh isian sumber, termasuk alamat KK yang terpisah, NIK orang
tua, program bantuan, koordinat, dan waktu dari Setara, disimpan pada
`murid_sumber_setara` per sekolah dan UID. Isian tersebut ikut diekspor kembali;
perubahan ini tidak menambah semua kolom sumber ke formulir biodata murid.

Penyimpanan memakai satu transaksi dan mencatat pengguna, hash file, waktu, serta
nomor baris sumber. Perubahan data setelah pratinjau mengharuskan pratinjau ulang.

Jalankan `node scripts/test-student-exchange-copy.mjs` untuk menguji pada salinan
database dengan siswa sintetis. CSV operasional hanya dibaca untuk memeriksa format,
tanpa disimpan. Pengujian mencakup impor ulang, ekspor ulang, penempatan, riwayat,
konflik identitas, pembatasan akses, pilihan baris, arsip, dan pembatalan transaksi.

## Kode QR murid

Kolom ke-67, `Kode QR Murid`, menyimpan kode utuh untuk pencadangan kartu.
Ekspor XLSX dan CSV memakai urutan kolom yang sama. Aksi **Unduh CSV** tersedia
bersama **Unduh data siswa** di area impor Akademik/Data Rapor. Template XLSX
menyertakan kolom QR; template CSV tersedia melalui endpoint template dengan
`?format=csv`.

- QR mengikuti UID murid lintas kelas, asrama, semester, dan tahun ajaran.
  Scan memakai data dan penugasan murid pada semester aktif.
- Cetak ulang mempertahankan kode dan hanya memperbarui informasi penempatan
  pada kartu. Generate untuk murid yang belum punya QR tidak mengganti kartu lama.
- **Perbarui QR** secara sengaja mencabut seluruh QR lama pada UID yang sama.
- Kolom QR kosong mempertahankan kode yang ada. Kode yang sama diterima;
  kode berbeda, ganda dalam file, milik murid lain/sekolah lain, atau sudah
  dicabut ditolak pada pratinjau. Impor tidak mencabut kartu.
- UID UUID yang belum dipakai dapat dipulihkan untuk murid baru dari cadangan;
  penanda identitas dan NPSN tetap diperiksa. Murid baru tetap masuk Murid Pasif.
- Impor dan ekspor kode memerlukan izin `absensi_qr_manage`. Tanpa izin itu,
  ekspor biodata mengosongkan kolom QR dan impor berkode QR ditolak.
- Jika kartu lama hanya menyimpan hash acak yang tidak bisa dipulihkan, scan
  kartu tersebut melalui akun berwenang untuk menyimpan kode aslinya. Ekspor
  memberi pesan pemeriksaan apabila kode belum bisa dicadangkan atau QR ganda.
- Cadangan ini memuat biodata dan kode kartu. Nilai, absensi, riwayat mutasi,
  serta daftar pencabutan tetap memerlukan cadangan database lengkap.

Kode QR tidak dimasukkan ke metadata sumber Setara atau isi audit. File ekspor
memuat kode yang dapat dipindai, sehingga disimpan oleh petugas yang berwenang.

Validasi: `node scripts/test-student-qr-copy.mjs` dan
`node scripts/test-student-exchange-copy.mjs`. Keduanya membuat salinan database
lebih dahulu dan memakai murid sintetis untuk semua perubahan.

## Rujukan tampilan ekspor QR

Perubahan tampilan terbatas pada satu tombol **Unduh CSV** dan penjelasan kolom
QR. Struktur halaman, tabel pratinjau, dialog, dan desain kartu dipertahankan.

| Elemen           | Sumber                                                                                   | Ukuran/perilaku                                         | Keterangan                                                 |
| ---------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------- | ---------------------------------------------------------- |
| Area impor       | `src/lib/components/murid/student-import-panel.svelte`                                   | Flex dengan wrap yang sudah ada                         | Fallback Kaganga; struktur dipertahankan                   |
| Tombol unduh     | Komponen yang sama, `btn btn-soft shadow-none`                                           | Tinggi 40 px, diukur di browser pada viewport 702 x 668 | Measured from existing Kaganga                             |
| Halaman akademik | Referensi lokal Rapkumer `../rapkumer/src/routes/(informasi-umum)/akademik/+page.svelte` | Alur pemilihan tahun/semester dan form yang sama        | Source inspected; tidak mengklaim dimensi Rapkumer terukur |

### Hasil verifikasi QR, 5 November 2026

- Dua skrip uji pada salinan database lulus, termasuk scan kegiatan dan verifikasi
  perjalanan dengan kode semester lama, cetak kartu, penolakan akses kelas lama,
  penerbitan bersamaan, pemulihan cache kode, serta pencadangan/pemulihan QR.
- Unduhan aplikasi: 317 murid, 67 kolom, dan 317 QR; kode pada CSV dan XLSX sama
  persis. Template unduhan: 67 kolom, tanpa baris murid.
- Tombol unduh: tinggi 40 px pada viewport 390 dan 1440 px; tidak ada luapan
  horizontal. Viewport dikembalikan setelah pemeriksaan.
- ESLint dan Prettier pada berkas terkait lulus. `pnpm check`: 0 galat dan
  119 peringatan bawaan proyek.
- Uji kamera/perangkat pemindai fisik belum dilakukan. Desain template kartu
  dan rapor tidak diubah.
