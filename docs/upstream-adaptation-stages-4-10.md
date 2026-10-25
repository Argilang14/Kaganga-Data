# Adaptasi Rapkumer: tahap 4 sampai 10

## Batas pekerjaan

Mengacu pada audit `upstream-rapkumer-v2.1.8-audit.md`. Ambil perubahan terpilih,
pertahankan rumus keasramaan, identitas tiga NPSN, jadwal tiga jenjang, dan
pemisahan akses absensi dibanding penilaian. Tidak ada merge upstream, push,
rilis GitHub, atau perubahan nomor versi.

| Tahap | Pekerjaan                                                                   | Status                                                                                     |
| ----- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| 4     | Reproduksi impor pada build sebelumnya dengan salinan database              | Selesai: RTS tetap kosong setelah impor                                                    |
| 5     | Samakan RTS impor dan manual; cegah mapel salah kelas dan nama murid ambigu | Selesai; impor Excel, simpan manual, dan pembatasan mapel guru lulus uji HTTP              |
| 6     | Periksa relevansi perbaikan jadwal                                          | Route publik upstream tidak ditambahkan; pembenahan reaktivitas jadwal akademik diterapkan |
| 7     | Adaptasi kop dan aset pengesahan                                            | Pengaturan admin per induk/jenjang; integrasi pertama pada cetak jadwal                    |
| 8     | Pertahankan rekap dan selaraskan akses keasramaan                           | Rumus tidak berubah; pengecualian jabatan akses diperbaiki pada form Wali Asuh             |
| 9     | Uji regresi data, izin, aset, dan tampilan                                  | Selesai dalam lingkup ini; 113 tes unit/regresi dan 12 kelompok uji integrasi lulus        |
| 10    | Pemeriksaan tipe, build, dan jalankan hasil lokal                           | Build berhasil; server lokal di port 5152; bukan paket rilis                               |

## Kontrak perubahan

RTS dihitung dari lingkup dan STS saja. Fungsi yang sama dipanggil jalur impor
dan form manual. Pembaruan hanya memengaruhi murid yang diimpor/disimpan; nilai
lama tidak dihitung ulang massal. Nama ganda dalam kelas dilewati dengan pesan
untuk diperiksa, bukan dipilih salah satunya.

Aset disimpan di `uploads/print-assets/sekolah-{id}/{scope}/` di luar SQLite.
`scope` hanya `induk`, `sd`, `smp`, atau `sma`. Kop tidak diwariskan dari induk
ke jenjang. Tanda tangan dan stempel dapat memakai aset induk karena kepala
sekolah yang sama; gambar jenjang sendiri didahulukan jika tersedia.
Pengelolaan dan pembacaan berkas mentah hanya untuk admin. Cetak tetap mengikuti
izin jenis dokumen. Tidak ada akun baru atau penimpaan izin saat login.

Unggah memeriksa MIME, isi PNG melalui decoder `pdf-lib`, batas 2 MB,
dimensi maksimal 6.000 piksel per sisi, dan maksimal 4 juta piksel.
Penulisan memakai berkas sementara unik lalu rename. Unggah invalid tidak
menghapus berkas sebelumnya. Perubahan dan penghapusan tercatat dalam audit.

Kop gambar mulai diterapkan pada cetak jadwal saja. Dokumen lain tetap memakai
kop yang sudah ada sampai diuji satu per satu. Tanda tangan dan stempel pada
jadwal memiliki toggle yang awalnya nonaktif. Tidak ada penggantian kop kartu
ujian atau ukuran kartu. Tanda tangan guru per pegawai belum ditambahkan.

## Referensi ukuran komponen

| Elemen          | Sumber Rapkumer                                                       | Keputusan Kaganga                                      | Kepastian                                            |
| --------------- | --------------------------------------------------------------------- | ------------------------------------------------------ | ---------------------------------------------------- |
| Pengaturan aset | `src/lib/components/settings/kop-surat-card.svelte`, commit `1df6d35` | Bagian pengaturan dengan judul dan aksi unggah/hapus   | Verified Rapkumer: struktur sumber                   |
| Padding         | Sumber yang sama: `p-6`                                               | 24px desktop, 20px HP                                  | Desktop dari sumber; HP fallback Kaganga             |
| Radius          | Sumber yang sama: `rounded-lg`                                        | Mengikuti kelas yang sama, tidak menambah radius besar | Verified Rapkumer: token kelas                       |
| Tombol          | Sumber yang sama: `btn-sm btn-soft`, ikon import/del                  | Kelas sama; hapus memakai ikon dan label aksesibel     | Verified Rapkumer: kelas, tinggi piksel belum diukur |
| Pratinjau       | Sumber yang sama: `min-h-24`, `max-h-28`                              | Bidang tetap 96px, gambar contain                      | Fallback Kaganga agar baris stabil                   |
| Susunan         | Sumber dua kolom `md:grid-cols-2`                                     | Baris aset: nama, gambar, aksi; satu kolom di HP       | Adaptasi untuk empat aset dan pemilih jenjang        |
| Sidebar/navbar  | Layout Kaganga saat ini                                               | Tidak diubah                                           | Di luar perubahan ini                                |

## Bukti verifikasi

Reproduksi build lama berhasil pada salinan backup:
`tmp/upstream-adaptation-qa-8uEZ72/result.json`.
Impor Excel berisi lingkup 80, STS 90, SAS 10 menghasilkan RTS kosong.
Hasil yang diharapkan dengan bobot 70/30 adalah 83.

Hasil akhir:

- 50 tes unit/regresi RTS, jadwal, identitas jenjang, jabatan, role, dan aset lulus.
- 63 tes tambahan akses absensi, perjalanan sekolah/asrama, monitoring kelas,
  format sekolah, kartu ujian/meja/absensi, QR kelas, jurnal, dan rekap lulus.
- `pnpm check`: 0 error, 116 warning di 35 berkas. Warning pada kode yang ada
  tidak dibersihkan lintas-modul dalam pekerjaan ini.
- ESLint pada berkas baru dan jalur impor yang diubah: lulus.
- `pnpm build`: berhasil menggunakan adapter Node.
- `git diff --check`: lulus; Git memberi peringatan normalisasi LF/CRLF.
- Perbandingan SHA-256 terhadap snapshot awal: hanya 14 berkas lama dalam
  lingkup adaptasi yang berubah; 1.174 berkas lama lainnya tetap sama.

Uji integrasi akhir dijalankan melalui
`scripts/test-upstream-adaptation-copy.mjs`. Hasil dan bukti privat berada di
`tmp/upstream-adaptation-qa-FdcIce/`, yang diabaikan Git:

- Impor lingkup 80, STS 90, SAS 10 menghasilkan RTS 83 pada bobot 70/30.
- Impor ulang pada bobot 40/60 menghasilkan 86, tanpa duplikasi baris.
- Nilai nol tetap dihitung; SAS kosong tidak mengubah RTS.
- Mapel kelas lain ditolak; nama murid ganda tidak menerima nilai.
- Simpan manual dan impor oleh guru menghasilkan RTS yang sama; guru tidak
  dapat mengimpor mapel tanpa penugasan.
- Akun guru, wali, dan Kepsek tidak dapat mengelola aset privat pengaturan.
- Unggah, baca, penolakan PNG rusak, pemisahan cakupan, dan hapus aset lulus.
- Wali Asuh/Asrama tetap dibatasi murid penilaian; jabatan Kepsek dapat membuka
  dan menyimpan penilaian sesuai akses operasionalnya.
- PDF jadwal seluruh jenjang landscape dan SD portrait berhasil lewat token
  PDF aplikasi. Keduanya satu halaman A4 sesuai orientasi. Tanda tangan/stempel
  aktif dan nonaktif menghasilkan payload sesuai opsi; kop induk tidak bocor
  ke SD. Hasil PDF dirender dengan Poppler dan diperiksa secara visual.
- Pengaturan diperiksa pada desktop 1440px, tablet 768px, dan HP 390px tanpa
  overflow halaman. Gambar pratinjau termuat.
- Interaksi HP memilih SD, mengunggah kop, membatalkan hapus, dan mengonfirmasi
  hapus berhasil; aset induk tidak ikut terhapus.
- `PRAGMA integrity_check`: `ok`; `foreign_key_check`: 0 pelanggaran.

Database dan seluruh aset pengujian berada pada salinan terisolasi. Tidak ada
penghitungan ulang nilai produksi atau penyalinan akun QA ke database aktif.
Server QA port 5178 dihentikan setelah selesai; port 1206 PC sekolah tidak disentuh.

## Cara mencoba lokal

Buka `http://localhost:5152`. Admin dapat membuka Pengaturan, lalu bagian
**Kop dan pengesahan dokumen**, memilih induk/jenjang, dan mengunggah PNG.
Pada Cetak Dokumen > Jadwal Pelajaran tersedia opsi **Tanda tangan dan stempel
kepala sekolah**, dengan nilai awal nonaktif.

Kop dinamis yang lama tetap dipakai bila belum ada gambar untuk cakupan dan
orientasi tersebut. Aset kop gambar baru belum diterapkan ke seluruh jenis
dokumen; tanda tangan per guru juga belum termasuk. Uji ini bukan sertifikasi
seluruh aplikasi atau pengujian di PC sekolah. Tidak ada push atau rilis GitHub.
