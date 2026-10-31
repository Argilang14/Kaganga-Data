# Data Asrama: tahap 1-12

## Batas perubahan

Data Asrama berada di Informasi Umum, pada `/asrama`. Tidak mengambil susunan
menu Setara, tidak mengubah sistem login, NPSN, kelas akademik, nilai, atau rapor.
Satu sekolah terintegrasi dapat memiliki kamar dengan penghuni lintas kelas dan
jenjang. Tidak ada kamar, wali, atau penghuni operasional yang dibuat otomatis.

## Tahapan

1. Audit penugasan lama dan backup database beserta berkas; pemulihan QA terverifikasi.
2. Master gedung/blok putra atau putri dan kamar dengan kapasitas.
3. Empat tabel terpisah, dibatasi `sekolah_id`, bukan NPSN jenjang.
4. Halaman Data Asrama: kamar, penghuni, penugasan, riwayat, penempatan murid.
5. Wali utama dan pendamping menggunakan ID pegawai; satu pegawai boleh beberapa kamar.
6. Penempatan individual/massal dengan pratinjau, batas 100 murid per transaksi.
7. Mutasi menutup interval lama dan menambahkan riwayat baru; tidak menimpa riwayat.
8. Izin baca, master, penempatan, dan penugasan terpisah di Manajemen Pengguna.
9. Pindah Asrama pada navbar, dengan cookie `active-kamar-id` yang terpisah dari kelas.
10. Pemantauan penghuni, pengasuhan, dan monitoring absensi berdasarkan kamar.
11. Pemetaan data lama melalui pemilihan dan konfirmasi operator; tidak menebak kamar dari nama wali.
12. Unit test, pengujian database salinan, build, pemeriksaan tipe, serta pengujian browser responsif.

## Model dan keamanan

- `asrama`: gedung/blok, kategori, status, versi edit optimistis.
- `asrama_kamar`: kapasitas dan status kamar; kamar tidak dipindahkan ke gedung lain.
- `asrama_penugasan`: pegawai, peran utama/pendamping, periode, nama snapshot, alasan, petugas.
- `asrama_penempatan`: identity UID, murid sumber, kamar, tanggal, sumber penempatan,
  nama/kelas snapshot, alasan dan petugas masuk/akhir. Hubungan UID tetap berlaku
  ketika data murid disalin ke semester berikutnya.

Interval berlaku `[mulai, selesai)` berdasarkan tanggal kalender WIB. Mutasi pada
hari yang sama menutup kamar asal sebelum membuka kamar tujuan. Kapasitas
diperiksa pada seluruh rentang tanggal, bukan hanya jumlah hari ini. Trigger
database menghalangi tumpang tindih, kategori tidak sesuai, duplikasi, penghapusan
riwayat, dan penonaktifan kamar/gedung yang masih dihuni. Master memakai versi
edit; konfirmasi penempatan memakai hash pratinjau dan transaksi tulis.

Penghuni yang keluar dari sekolah tidak diam-diam dihapus dari kamar. Pengelola
perlu mengakhiri penempatannya; kapasitas baru bebas setelah itu. Riwayat memiliki
referensi ke murid sumber sehingga penghapusan permanen sumber yang masih
dirujuk akan ditolak database, bukan menghilangkan bukti penempatan.

## Matriks izin

| Pengguna                                      | Akses bawaan                                                             |
| --------------------------------------------- | ------------------------------------------------------------------------ |
| Admin / jabatan dengan akses operasional luas | Master, penempatan, penugasan, riwayat dalam sekolah aktif               |
| Wali Asrama                                   | Baca kamar penugasan ID pegawainya dan murid binaan                      |
| Wali Asuh                                     | Baca kamar yang terkait penugasan dan murid binaannya sendiri            |
| Guru / dapur / keamanan                       | Tidak otomatis mendapat Data Asrama                                      |
| Izin tambahan                                 | `asrama_lihat`, `asrama_manage`, `asrama_penempatan`, `asrama_penugasan` |

Pengecualian jabatan Waka Humas mengikuti pembatasan menu yang sudah ada, tidak
otomatis mendapat manajemen asrama. Catatan pengasuhan pribadi tetap membuang
perluasan jabatan sebelum menghitung cakupan murid. Izin absensi sekolah luas
Wali Asrama dipertahankan hanya dalam konteks absensi, tidak memperluas catatan
pribadi atau nilai.

Wali Asrama lama berbasis nama hanya menjadi fallback untuk murid yang belum
pernah dipetakan ke kamar. Setelah dipetakan, akses mengikuti penugasan pegawai
pada kamar saat ini. Nama pegawai ganda tidak digunakan untuk fallback.
Penugasan Wali Asuh per murid tidak ditimpa oleh wali kamar.

## Pemakaian dan migrasi manual

1. Tambahkan gedung/blok dan kategorinya, kemudian kamar serta kapasitas sebenarnya.
2. Di Penugasan, pilih wali menggunakan pegawai yang tepat (periksa NIP/ID).
3. Di Penempatan Murid, cari/pilih murid lintas kelas, pilih kamar dan tanggal.
4. Periksa nama, kelas, kamar asal, wali lama dan wali tujuan pada pratinjau.
5. Konfirmasi untuk menyimpan. Penempatan akan batal seluruhnya jika satu murid
   tidak valid atau data telah berubah. Pilihan lama tetap ada untuk diperiksa.
6. Pindah kamar melalui Penempatan Murid yang sama; akhiri penghuni keluar melalui
   tab Penghuni. Jangan menghapus riwayat untuk mengosongkan kamar.

Penempatan yang masih terbuka juga dapat diakhiri dari tab Riwayat. Ini diperlukan
jika murid tidak disalin ke semester aktif, tetapi penempatan lamanya belum ditutup.

Nama/NIP wali lama pada Data Murid tetap disimpan, tetapi tidak dijadikan kunci
untuk menggabungkan identitas atau membuat kamar secara otomatis.

## Konteks layar

Pindah Asrama hanya memindahkan tampilan. Pada menu akademik, pilihan kamar
mengarahkan ke daftar penghuni, tidak memfilter nilai berdasarkan asrama.
Pada Pengasuhan dan Monitoring Absensi, konteks kamar tetap pada halaman itu.
Pemilih kelas dan kamar memiliki cookie terpisah. Tanggal monitoring menggunakan
riwayat penghuni pada tanggal tersebut. Tanpa filter kamar, cakupan izin lama tetap
berlaku termasuk murid yang belum ditempatkan.

UI menggunakan komponen Kaganga yang tersedia: DaisyUI, tabel bergulir lokal,
tab, dialog native berbatas 672px, input/tombol sekitar 40px dan radius 8px.
Ukuran ini mengikuti fallback lokal Kaganga, bukan klaim hasil pengukuran live
repositori Rapkumer. Tidak ada perubahan CSS global atau dependensi baru.

## Verifikasi dan pemulihan

- `node --test src/lib/dormitory.test.ts`: validasi dan konteks tampilan.
- `node scripts/test-dormitory-copy.mjs`: salinan SQLite dengan fixture sintetis,
  menguji kapasitas, transfer, izin, UID lintas semester, integritas dan data lama.
- `node scripts/test-dormitory-ui-copy.mjs`: browser pada database QA, port 5193,
  ukuran 320/360/390/768/1024/1280/1440/1920, dialog, simpan, pratinjau gagal/berhasil, dan tema gelap.
- Bukti runtime dan screenshot berada di folder QA yang ditunjuk
  `tmp/dormitory-latest.json`, tidak boleh dijadikan data produksi.

Backup awal ada di `dist/backups/report-history/audit-2026-10-31T05-47-48-596Z`.
Manifest mencatat checksum, berkas, dan hasil pemulihan ke direktori QA. Jika perlu
rollback operasional, hentikan server, backup keadaan terbaru, pulihkan database
dan berkas sebagai satu kesatuan dengan utilitas restore yang ada. Jangan menyalin
database di atas server yang masih berjalan. Tidak perlu menghapus tabel atau
mengubah kelas untuk menonaktifkan penggunaan modul baru.

Belum ada rilis installer, push GitHub, integrasi Setara, QR asrama baru,
atau pengubahan penugasan murid nyata dalam pekerjaan ini.

## Hasil verifikasi lokal, 31 Oktober 2026

- 369 unit test proyek lulus, ditambah pengulangan 13 tes terfokus izin/validasi.
- 15 skenario database salinan lulus, termasuk konfirmasi serentak dan batas tenant.
- 11 skenario browser lulus pada delapan ukuran layar, dengan screenshot dan tema gelap.
- Svelte check: 0 galat, 116 peringatan lama. Lint file terkait lulus.
- Build terakhir keluar dengan kode 0. HTTP login dan aset terbaru di 5152: 200;
  Data Asrama tanpa login: 303, sesuai proteksi sesi.
- Server baru PID 29984. Port terpakai dibuktikan HTTP dan probe bind EADDRINUSE.
- Sesudah aktivasi, 12 tabel inti dibandingkan dengan backup awal: tidak ada perubahan.
  Tetap 92 murid dan 175 pegawai. Keempat tabel asrama operasional kosong.

Mulai melalui Informasi Umum > Data Asrama: tambah asrama, tambah kamar, tugaskan
wali, kemudian pilih murid untuk pratinjau penempatan. Pindah Asrama di navbar
menampilkan pilihan setelah kamar yang dapat diakses tersedia. Pemetaan penghuni
dan wali sebenarnya tetap memerlukan pemeriksaan operator sekolah.
