# Pengasuhan & Asrama: penerapan awal

## Lingkup dan keputusan

Mengadopsi alur yang dipetakan pada issue #6 dan audit SIAP SR, bukan menyalin kode,
akun, atau database SIAP SR. Tidak ada koneksi ke Worker atau migrasi riwayat eksternal.
Menu awal: Ringkasan, Laporan Piket, Kejadian & Tindak Lanjut, Perkembangan Anak,
dan Pantau Sakit. Data asrama/kamar, lampiran, laporan cetak, dan integrasi API ditunda.

Pengguna mengonfirmasi: Wali Asuh dan Wali Asrama mengikuti penugasan murid;
admin dapat mengawasi. Akses absensi seluruh sekolah tidak membuka catatan pengasuhan.
Guru, keamanan, dapur, wali murid, dan jabatan pimpinan tanpa role pengasuhan tidak
otomatis memperoleh akses. Pegawai pendamping harus aktif dan memiliki nama unik
sesuai pemetaan penugasan Kaganga yang sudah ada.

Catatan baru terikat UID murid dan menyimpan nama/kelas saat kejadian. Pergantian
semester tidak membuat identitas pengasuhan baru. Catatan rapor Wali Asrama lama
tetap menjadi sumber catatan semester rapor; jurnal pengasuhan bertanggal menjadi
bukti pendampingan, tidak disalin otomatis ke rapor. Penilaian tidak berubah.

Kejadian/sakit mempunyai pembaruan bertanggal sampai selesai/pulih. Tidak ada hapus
permanen atau penimpaan riwayat. Catatan sakit tidak mengubah absensi, memberikan
diagnosis otomatis, atau menerbitkan izin. Scan, absensi, dan izin memakai menu lama.

Laporan piket disimpan per petugas, tanggal, dan shift; draf dapat diperbaiki sebelum
diselesaikan. Laporan selesai dikunci. Isi narasi hanya dibaca penulis dan admin,
bukan dibagikan ke semua wali. Kasus terbuka tetap terlihat kepada pendamping yang
saat ini berhak atas murid tersebut. Ini belum merupakan persetujuan penerima serah
terima atau pengiriman pesan otomatis. Shift malam bertanggal mulai, berakhir besok.

## Acuan desain sebelum implementasi

Sumber Rapkumer lokal: ref `origin/main`, komponen `src/lib/components/global-modal.svelte`,
`src/routes/+layout.svelte`, `src/routes/(informasi-umum)/murid/+page.svelte`, serta
`src/routes/(input-nilai)/asesmen-sumatif/+page.svelte`. Halaman pengasuhan tidak
tersedia di sumber Rapkumer; pola tabel, formulir, dan dialog menjadi acuan.

| Komponen              | Sumber / kepastian                                           | Penerapan                                              |
| --------------------- | ------------------------------------------------------------ | ------------------------------------------------------ |
| Kerangka aplikasi     | Verified Rapkumer: drawer dan Navbar bersama                 | Memakai layout Kaganga yang sudah ada                  |
| Sidebar/navbar        | Fallback Kaganga: token CSS terpasang                        | 280px / 64px; tanpa perubahan global                   |
| Lebar isi/gutter      | Fallback Kaganga: `app-content-width`, `app-page-gutter`     | Maksimal 1280px; mengikuti gutter layout               |
| Dialog                | Verified Rapkumer: `sm:max-w-2xl`, `max-h-[85vh]`, flex      | 42rem, tinggi 85dvh; header/footer tetap, isi bergulir |
| Radius/padding dialog | Fallback Kaganga: token aplikasi                             | Radius 8px; padding 24px desktop, 16px HP              |
| Tabel                 | Verified Rapkumer: `table`, border, tombol `btn-sm btn-soft` | 20 baris per halaman; scroll di dalam tabel pada HP    |
| Tinggi baris/header   | Fallback Kaganga; belum pengukuran piksel Rapkumer           | Minimum 48/44px, padding sel 12px                      |
| Form dan tombol       | Verified Rapkumer: input/select DaisyUI dan tombol soft      | Kontrol 40px; ikon memakai komponen Icon yang tersedia |
| Breakpoint            | Fallback Kaganga                                             | Form 1 kolom HP, 2 mulai 640px; ringkasan 1/3 kolom    |
| Viewport QA           | Terverifikasi melalui browser lokal                          | 1440x1000, 768x1024, 390x844, 320x740                  |

Permukaan tenang, aksen info/success/warning/error sesuai arti status, tanpa hero
atau kartu bertumpuk. Tabel mengutamakan anak, tanggal, kategori, petugas, dan status.
Dialog native menjaga fokus. Draf, gagal simpan, koneksi putus, dan penutupan dialog
tidak boleh membuang isian tanpa konfirmasi.

## Data dan pemeriksaan

Tabel baru dibuat secara aditif melalui ensure-schema. Mutasi memeriksa sekolah,
role, pegawai, dan UID yang masih ditugaskan di server. Kunci permintaan catatan dan
tindak lanjut mencegah simpan ganda; revisi mencegah pembaruan basi. Laporan piket
unik per petugas/tanggal/shift. Audit hanya memuat ID dan jenis operasi,
tidak menyalin narasi kesehatan/pengasuhan ke log umum.

Backup privat awal berada di `dist/backups/pengasuhan/`, diabaikan Git. Semua uji
penulisan harus memakai salinan database.

## Hasil verifikasi 25 Oktober 2026

- 299 uji unit lulus, termasuk 5 uji aturan pengasuhan baru.
- `scripts/qa-pengasuhan-copy.mjs`: 18 kelompok pemeriksaan lulus pada salinan
  database terisolasi di port 5186. Mencakup akses role/jabatan, penugasan Wali Asuh
  dan Wali Asrama, IDOR, lintas sekolah, pegawai nonaktif, nama pegawai ambigu,
  kesinambungan UID antarbaris semester, idempotensi, pembaruan bersamaan, revisi
  basi, status, satu pantauan sakit aktif, laporan pribadi, dan penguncian laporan.
- Isi tabel absensi, asesmen, dan catatan rapor dibandingkan sebelum/sesudah uji:
  tidak berubah. Narasi pribadi tidak masuk audit umum. `PRAGMA quick_check`: ok.
- Uji browser mencakup simpan formulir, pembaruan daftar, kegagalan simpan yang
  mempertahankan isian, Escape/konfirmasi penutupan, formulir baru kosong,
  serta pembukaan popup tanpa `crypto.randomUUID` untuk akses LAN HTTP.
- Screenshot pada empat viewport di atas: tidak ada overflow halaman atau dialog
  keluar viewport; tidak ada galat JavaScript. Tabel kecil memakai scroll internal.
- Pengukuran popup catatan: desktop 672px (x384-1056 pada viewport 1440px),
  HP 374px (x8-382 pada viewport 390px), mengikuti aturan modal Kaganga terpasang.
  Screenshot dan metrik privat terakhir: `tmp/pengasuhan-qa-1792944997028/`.
- `pnpm run check`: 0 error; 117 peringatan lama di 36 berkas. ESLint untuk
  berkas fitur baru: 0 masalah. Build produksi berhasil.
- Server lokal dimuat ulang pada port 5152, listener `0.0.0.0`, PID 2304;
  `/login` terverifikasi HTTP 200. Tidak ada commit, push, atau rilis baru.

Tahap ini bukan integrasi langsung SIAP SR. Belum ada impor data eksternal,
master kamar/asrama, lampiran, cetak laporan, atau pengiriman pesan otomatis.
