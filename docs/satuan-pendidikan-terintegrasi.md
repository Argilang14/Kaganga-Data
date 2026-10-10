# Satu sekolah operasional, tiga satuan pendidikan

## Model

Sekolah induk tetap menyimpan pengguna, kepala sekolah, alamat, logo, kurikulum,
absensi, dan data operasional bersama. SD, SMP, dan SMA bukan tiga sekolah baru.
Masing-masing adalah identitas resmi yang dihubungkan dengan kelas per semester.

Data resmi yang diberikan untuk SRT 3 Provinsi Bengkulu:

| Jenjang | Nama resmi                                        | NPSN     |
| ------- | ------------------------------------------------- | -------- |
| SD      | Sekolah Rakyat Dasar Provinsi Bengkulu            | 76550273 |
| SMP     | Sekolah Rakyat Menengah Pertama Provinsi Bengkulu | 72735090 |
| SMA     | Sekolah Rakyat Menengah Atas Provinsi Bengkulu    | 70055420 |

Kepala sekolah, NIP, tanda tangan, alamat, dan logo tetap bersumber dari sekolah
induk. Tidak ada penyalinan akun, murid, atau QR untuk membuat tiga satuan ini.

## Aktivasi Oleh Operator

Pada Form Sekolah, pilihan SRT mengganti input NPSN dengan keterangan
**Diatur di Satuan Pendidikan**. Keterangan ini tidak disimpan sebagai NPSN.
Sekolah SRT baru disimpan tanpa NPSN induk; nilai NPSN induk sekolah lama tetap
dipertahankan untuk kompatibilitas. Tombol Satuan Pendidikan tersedia setelah
sekolah tersimpan dan menjadi sekolah aktif. Sekolah non-SRT tetap wajib
mengisi NPSN delapan digit. Mengganti pilihan jenjang tidak menghapus profil
satuan, pemetaan kelas, atau dokumen terbit. Pada mode non-SRT, dokumen baru
kembali memakai identitas induk, bukan pemetaan satuan yang disimpan sebelumnya.

1. Buat backup database dan berkas sebelum memasang pembaruan.
2. Pastikan sekolah aktif adalah sekolah terintegrasi/SRT, bukan membuat tiga
   entri baru di daftar sekolah.
3. Buka **Informasi Umum -> Data Sekolah -> Satuan Pendidikan**.
4. Isi dan simpan nama resmi serta NPSN delapan digit untuk ketiga jenjang.
5. Pilih semester, periksa pilihan satuan setiap kelas, lalu konfirmasi dan simpan
   pemetaan. Saran berdasarkan fase/nama kelas tidak disimpan tanpa konfirmasi.
6. Ulangi pemetaan untuk semester lain yang dokumennya masih akan dicetak.
7. Periksa pratinjau dokumen satu murid dari setiap jenjang sebelum mencetak massal.

Identitas sekolah terintegrasi yang belum dipetakan tidak ditebak sebagai SMA.
Dokumen resmi dan penambahan peserta ujian meminta pemetaan terlebih dahulu.
Sekolah non-SRT tetap memakai identitas tunggal seperti sebelumnya.

## Nomor Ujian Dan Riwayat

Nomor baru memakai NPSN satuan diikuti nomor urut minimal dua digit. Urutan
berlanjut menurut kelas yang ditambahkan, secara terpisah untuk setiap NPSN.
Contoh: SD 7655027301, SMP 7273509001, SMA 7005542001.

Nomor peserta lama tidak dinomori ulang otomatis. Penyusunan ulang hanya untuk
sesi draf, setelah pratinjau dan konfirmasi. Pratinjau kedaluwarsa ditolak.
Peserta ujian dan STTM terbit memakai snapshot nama/NPSN; perubahan profil satuan
tidak mengganti identitas dokumen yang sudah diterbitkan.

Pemetaan kelas juga menyimpan snapshot. Koreksi profil satuan tidak otomatis
mengganti snapshot kelas lama. Simpan ulang pemetaan semester yang memang ingin
diperbarui setelah diperiksa; jangan memetakan ulang semester lama sembarangan.
Kenaikan kelas membutuhkan kelas tujuan yang sudah dipetakan dan tetap menjaga
UID murid serta riwayat kelas sumber. Penyalinan semester membawa pemetaan kelas.

## Import, Export, Dan Dapodik

Export murid menambahkan Satuan Pendidikan, Jenjang Satuan, dan NPSN Satuan.
Import lama tanpa kolom tambahan tetap didukung. Metadata satuan yang diisi
harus sesuai profil dan pemetaan kelas; konflik membatalkan seluruh transaksi.
Aturan NIS unik sekolah/semester belum diubah menjadi unik per satuan. NIS yang
sama antarjenjang belum didukung dan tidak boleh diimpor dengan mengabaikan konflik.

Konfigurasi URL/token serta pratinjau Dapodik dapat dipilih per satuan. Untuk SRT,
**penerapan data dan pengiriman nilai masih dinonaktifkan**, termasuk di server,
sampai pencocokan ID Dapodik benar-benar dipisahkan per satuan. Pengujian memakai
server mock lokal, bukan Dapodik sekolah.

## Verifikasi Pengembangan

Backup awal: `tmp/before-education-units-20261008-115014`.
QA: `node scripts/test-education-units-copy.mjs`, salinan SQLite dengan server
sementara; port produksi 1206 ditolak. Gunakan `EDUCATION_UNITS_QA_PORT=5152`
hanya ketika port tersebut kosong; jangan menutup proses lain untuk menjalankan QA.

Pengujian mencakup relasi lintassekolah, validasi NPSN, pemetaan, nomor ujian
lintasjenjang, duplikasi, pratinjau ulang, PDF kartu biasa/meja, sampul rapor,
import baru/lama dan rollback, snapshot STTM, promosi, izin pengaturan, Dapodik
mock, tampilan 1366/768/390/320 px, serta SQLite dan foreign key.

Data sekolah pada PC produksi tidak diubah dalam pengembangan ini. Konfigurasi
nama/NPSN dan konfirmasi kelas di server sekolah tetap menjadi langkah aktivasi
operator. Tidak ada rilis, perubahan versi, atau push GitHub otomatis.
