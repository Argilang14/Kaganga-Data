# Informasi siswa: fondasi tahap 1-4

Status fondasi: tahap 1-4 telah disiapkan. Formulir dan foto tahap 5-7 kini didokumentasikan dalam `informasi-siswa-form.md`; hasil pengujian di bawah adalah catatan saat fondasi selesai. Pilihan dokumen dan PDF belum ditambahkan. Perubahan ini belum merupakan rilis aplikasi.

## Tahap 1: audit sumber data

| Informasi pada contoh                                                          | Sumber                                 | Keputusan                                                                                                                                                   |
| ------------------------------------------------------------------------------ | -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Nama, NIS, NISN, NIK, tempat/tanggal lahir, jenis kelamin, agama               | `murid`                                | Gunakan data yang sudah ada; NIS/NISN bukan kunci profil tambahan.                                                                                          |
| Sekolah asal                                                                   | `murid.pendidikanSebelumnya`           | Tidak menambah kolom duplikat.                                                                                                                              |
| Kelas dan jenjang                                                              | `kelas` dan pemetaan satuan pendidikan | Mengikuti murid/kelas yang dipilih pada saat cetak.                                                                                                         |
| Foto murid utama                                                               | `murid.foto`                           | Tidak diganti oleh foto tambahan.                                                                                                                           |
| Ayah, ibu, wali, pekerjaan, kontak                                             | Relasi `wali_murid`                    | Tidak menyalin kembali ke tabel profil tambahan.                                                                                                            |
| Jalan, desa, kecamatan, kabupaten, provinsi                                    | Relasi `alamat`                        | Tetap menggunakan sumber yang sudah ada. RT/RW tambahan tidak menimpa teks jalan.                                                                           |
| Kondisi fisik dan ukuran baju/celana/sepatu                                    | `kesehatan_murid`                      | Ambil catatan terakhir pada atau sebelum tanggal data, dari anggota identitas yang sama. Tanggal sumber ikut dikembalikan. Data kosong tidak berarti sehat. |
| KK, DTSEN, bansos, penghasilan, tanggungan, rumah, kesediaan asrama, pendataan | Belum memiliki kolom khusus            | Tambahkan sebagai profil pribadi lintas semester.                                                                                                           |
| Foto murid tambahan, rumah, orang tua/wali                                     | Belum memiliki slot khusus             | Siapkan metadata; unggah dan pengelolaan berkas dilaksanakan pada tahap 6.                                                                                  |

`anakKe` tidak sama dengan jumlah tanggungan. Petugas pengukuran kesehatan tidak otomatis dianggap petugas pendataan sosial.

## Tahap 2: kontrak informasi tambahan

Semua kolom biodata berikut opsional. Data belum diisi disimpan sebagai `NULL`; pilihan Tidak disimpan sebagai `false`, bukan kosong.

| Kelompok       | Kolom dan bentuk nilai                                                                                                                                                                                                                             |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Keluarga       | `nomorKk`: teks 16 digit, nol awal dipertahankan.                                                                                                                                                                                                  |
| Sosial         | `desilDtsen`: bilangan bulat 1-10 atau kosong.                                                                                                                                                                                                     |
| Bantuan        | `statusBansos`: menerima/tidak_menerima/kosong; `jenisBansos`: daftar JSON PKH, sembako, PIP, lainnya; `bansosLainnya`: keterangan opsional. Kosong tidak dianggap tidak menerima.                                                                 |
| Ekonomi        | `penghasilanKeluarga`: teks nominal/rentang bulanan maksimal 100 karakter; `jumlahTanggungan`: bilangan bulat 0-100. Penghasilan belum digunakan untuk perhitungan otomatis.                                                                       |
| Tempat tinggal | `rt`, `rw`: teks 1-3 digit; `statusHunian`: milik_sendiri/sewa/menumpang/dinas/lainnya; `luasTempatTinggal`: m2; `statusSertifikat`: ada/tidak_ada/tidak_diketahui; `pemilikRumah`: teks. Kepemilikan rumah dipisahkan dari keberadaan sertifikat. |
| Asrama         | `bersediaAsrama`, `suratPernyataanDitandatangani`: Ya/Tidak/Belum diisi; `tanggalSuratPernyataan`: opsional, hanya jika sudah ditandatangani.                                                                                                      |
| Pendataan      | `petugasPendataanId`: pegawai aktif sekolah; nama petugas disimpan sebagai snapshot; `tanggalPendataan`; `catatanPetugas`: maksimal 2.000 karakter. Petugas survei dapat berbeda dari akun penyimpan.                                              |

Tanggal harus sah. Tanggal pendataan dan penandatanganan tidak boleh melewati hari ini. Pembaruan parsial tidak mengosongkan kolom yang tidak dikirim. Untuk mengubah status bantuan menjadi tidak menerima, rincian bantuan lama harus dikosongkan secara eksplisit, bukan dihapus diam-diam.

## Tahap 3: penyimpanan

- `murid_profil_tambahan`: satu baris untuk pasangan `sekolah_id + identity_uid`. Tidak terikat pada semester atau kelas tertentu.
- `murid_profil_foto`: satu slot per jenis `murid_tambahan`, `rumah`, `orang_tua`; metadata saja, tanpa blob gambar. Relasi gabungan memastikan foto dan profil berasal dari sekolah yang sama.
- Lokasi berkas yang disiapkan: `<uploadsDir>/murid-profil/sekolah-<id>/<uuid>.<jpg|png|webp>`. Berkas tidak ditempatkan di `static` dan tidak menggunakan URL bebas dari formulir.
- Batas awal foto: 5 MB per slot. Pemeriksaan isi gambar, unggah/ganti/hapus, serta pembacaan terotorisasi baru dihubungkan pada tahap 6.
- Metadata yang dikembalikan untuk halaman hanya ID, jenis, dan waktu pembaruan; lokasi berkas serta hash tidak dikirim.
- Migrasi hanya menambah tabel dan indeks; tidak menyalin/mengubah biodata murid lama atau mengisi nilai perkiraan. Didaftarkan dalam startup ensure dan aman dijalankan ulang.
- Setiap penyimpanan memeriksa `revisi`, dilakukan dalam transaksi, dan menghasilkan audit nama kolom yang berubah tanpa menyalin KK, penghasilan, atau catatan pribadi ke log umum.
- Profil lama tetap dapat dibaca admin. Pengubahan profil murid berstatus arsip diblokir. Penghapusan permanen identitas diblokir selama profil tambahan masih ada, agar profil dan foto tidak menjadi yatim. Mekanisme penghapusan profil harus disiapkan bersama pengelolaan dokumentasi.

Sebelum unggah foto diaktifkan pada tahap 6, tambahkan folder ini pada manifest backup/pemulihan dan pemeriksaan berkas hilang. Pembersih file saat ini memeriksa foto utama secara langsung dan folder lampiran secara terpisah; folder profil baru tidak dimasukkan ke pembersihan otomatis. Tidak ada berkas profil baru yang ditulis pada tahap 1-4.

## Tahap 4: izin akses

| Izin                  | Kewenangan                                                                                                                                   |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `murid_profil_lihat`  | Baca informasi pribadi dan dokumentasi sesuai cakupan.                                                                                       |
| `murid_profil_manage` | Baca dan ubah profil; izin ini tidak otomatis mengizinkan cetak.                                                                             |
| `murid_profil_cetak`  | Pengambilan data untuk cetak; tidak otomatis memberi akses ubah atau membuka formulir. Tahap cetak juga harus memeriksa akses Cetak Dokumen. |

Admin memiliki ketiganya. Nonadmin memerlukan izin khusus, terhubung ke pegawai aktif di sekolah yang sama, dan mengikuti pemeriksaan penugasan Data Murid. Guru/wali tanpa jabatan operasional terbatas pada penugasannya; Wali Asuh/Asrama dibatasi lagi ke murid binaan. Jabatan operasional yang diberi izin khusus tetap memakai cakupan operasional sekolahnya.

Izin tersebut tidak otomatis diberikan oleh bundel role maupun jabatan Kepsek/Waka/Operator. Admin dapat memberikannya melalui daftar izin yang sudah ada. Akses baca Data Murid, absensi, foto identifikasi, dan cetak umum tidak membuka profil pribadi ini. Nonadmin hanya dapat mengakses melalui baris murid pada semester aktif, sehingga penugasan lama tidak membuka profil terkini setelah murid naik kelas.

Pemeriksaan server dilakukan sebelum membaca profil, relasi keluarga, kesehatan, maupun metadata foto. Sekolah/UID/petugas pencatat sistem/revisi tidak dapat disisipkan melalui isi biodata.

## Batas tahap berikutnya

Tahap 5-7: tab Informasi Tambahan, formulir responsif, pengelolaan foto, validasi formulir, backup berkas, dan tampilan kelengkapan.

Tahap 8-12: Cetak Informasi Siswa, satu murid/kelas, background khusus, A4 landscape satu murid per halaman, penyamaran NIK/KK, pratinjau dan unduh PDF, pengujian cetak. Profil yang disimpan saat ini merupakan kondisi terbaru, bukan arsip sosial historis per tanggal; hanya sumber kesehatan yang dipilih berdasarkan tanggal.

## Pengujian

```powershell
node --test src/lib/murid-profile.test.ts src/lib/server/db/murid-profile-schema.test.ts src/routes/pengguna/permissions.test.ts
node scripts/test-murid-profile-foundation-copy.mjs
pnpm check
pnpm build
```

Pengujian skema menggunakan SQLite sementara di memori. Pengujian layanan membuat salinan database di `tmp/murid-profile-foundation-*`, mengarahkan seluruh akses layanan ke salinan tersebut, dan tidak mengganti server port 5152. Tidak ada akun, profil, foto, atau data uji yang ditambahkan ke database asli.

Hasil verifikasi 26 Oktober 2026:

- 26 uji unit/regresi lulus, mencakup profil baru, skema, izin pengguna, jabatan, ekspor, dan kebijakan penghapusan murid.
- 9 kelompok QA layanan lulus pada salinan database: `tmp/murid-profile-foundation-IIto7v/results.json`.
- `pnpm check`: 0 error; 117 peringatan lama pada 36 berkas lain.
- ESLint berkas yang disentuh dan Prettier berkas baru/pengujian lulus; pemformatan skema dibatasi pada blok profil baru.
- `pnpm build` lulus sampai adapter Node selesai.
- Server 5152 tidak dimuat ulang; `/login` dan tiga aset halaman yang diperiksa tetap merespons HTTP 200. Skema startup baru akan diterapkan saat build baru dijalankan. Formulir dan PDF belum tersedia pada tahap ini.
