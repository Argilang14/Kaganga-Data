# Audit UI Pengasuhan & Asrama

Lingkup: lima halaman pengasuhan beserta tabel, filter, navigasi, dan dialog.
Tidak mengubah API, skema, izin akses, atau alur penyimpanan.

## Acuan sebelum perubahan

Rapkumer lokal `origin/main`:

- `src/routes/(informasi-umum)/murid/+page.svelte`: tabel `table`, header
  `bg-base-200`, pembungkus scroll horizontal, aksi `btn-sm btn-soft`.
- `src/lib/components/global-modal.svelte`: dialog native, `sm:max-w-2xl`,
  `max-h-[85vh]`, isi `min-h-0` yang bergulir, aksi `shrink-0`.
- Layout dan token Kaganga terpasang dipertahankan. Tidak memasang UI framework baru.

| Elemen             | Sumber / kepastian                                           | Sebelum                                              | Sasaran                                                         |
| ------------------ | ------------------------------------------------------------ | ---------------------------------------------------- | --------------------------------------------------------------- |
| Sidebar / navbar   | Fallback Kaganga, `src/app.css`                              | 280px / 64px; navbar HP 56px                         | Tidak berubah                                                   |
| Konten / gutter    | Fallback Kaganga, token aplikasi                             | Maksimal 1280px; 16px desktop, 12px HP               | Tidak berubah                                                   |
| Tabel              | Verified Rapkumer: `table`, header berwarna, scroll internal | Kolom melebar otomatis; kosong mengikuti lebar tabel | Proporsi kolom terarah, kosong tetap terlihat pada HP           |
| Header / sel tabel | Fallback Kaganga sebelum pengukuran browser                  | 44px / minimum 48px; padding 12px                    | Header 44px; baris minimum 64px agar dua baris metadata terbaca |
| Form               | Verified Rapkumer: kontrol DaisyUI; ukuran Fallback Kaganga  | Kontrol 40px, filter terpisah dari tabel             | Kontrol 40px dan label sejajar dalam toolbar tabel              |
| Dialog             | Verified Rapkumer: maksimal 42rem dan tinggi 85vh            | Footer sticky di dalam area gulir                    | Header dan footer tetap, hanya isi yang bergulir                |
| Radius             | Fallback Kaganga: `--app-radius`                             | 8px                                                  | Menggunakan token yang sama                                     |
| Warna              | Fallback Kaganga: tema DaisyUI terpasang                     | Aksen hanya garis atas kartu                         | Aksen semantik ringan: info, warning, error, success            |
| Navigasi           | Struktur halaman Kaganga terpasang                           | Lima tombol yang membungkus tidak seragam            | Tautan halaman dengan status aktif jelas dan ukuran stabil      |

## Verifikasi

Screenshot sebelum/sesudah memakai salinan database terisolasi melalui
`QA_UI_AUDIT=1 node scripts/qa-pengasuhan-copy.mjs`.
Viewport: 1440, 1024, 768, 390, dan 320 CSS px.

## Hasil pengukuran browser

Pada viewport desktop 1440px, sumber ukuran berikut adalah hasil ukur Kaganga,
bukan angka yang diasumsikan berasal dari Rapkumer:

| Elemen                   | Sebelum               | Sesudah                                            |
| ------------------------ | --------------------- | -------------------------------------------------- |
| Sidebar / navbar         | 280px / 64px          | Tetap 280px / 64px                                 |
| Lebar konten aktual      | 1103px                | Tetap 1103px                                       |
| Judul halaman            | 24px                  | Tetap 24px                                         |
| Header tabel             | 46px, teks 14px       | 44px, teks 12px                                    |
| Baris dua baris metadata | 61px, teks utama 12px | Sekitar 66px, teks utama 13px                      |
| Tombol utama             | Tinggi 32px           | Tinggi 40px                                        |
| Kontrol filter           | Tinggi 40px           | Tinggi 40px; input pencarian di dalam wrapper 40px |

Perubahan berlaku untuk Ringkasan, Laporan Piket, Kejadian & Tindak Lanjut,
Perkembangan Anak, dan Pantau Sakit. Form tambah, detail, tindak lanjut, serta
laporan piket memakai header dan footer tetap dengan isi bergulir. Tabel HP
bergulir secara internal, kolom murid tetap terlihat, dan area kosong tidak
terdorong keluar layar oleh lebar tabel.

Artefak lokal (diabaikan Git, memakai data uji pada salinan database):

- Sebelum: `tmp/pengasuhan-qa-1792945645906/`.
- Sesudah awal: `tmp/pengasuhan-qa-1792946163418/`.
- Sesudah akhir: `tmp/pengasuhan-qa-1792946515836/`, 40 screenshot termasuk
  tabel HP sebelum/sesudah digeser dan detail dengan footer tetap.
- Masing-masing memuat screenshot lima halaman pada lima viewport,
  `ui-measurements.json`, form, detail, filter kosong, dan tema gelap.

Pemeriksaan akhir sesudah perubahan: 20 kelompok QA lulus, tanpa overflow halaman
atau galat JavaScript. Termasuk gulir tabel dengan keyboard, posisi footer popup,
latar dialog tidak menerima fokus, dan fokus kembali ke tombol pemicu.
Lima unit test pengasuhan lulus. ESLint dan Prettier untuk komponen lulus. `pnpm run check`
menghasilkan 0 error dan 117 warning lama di 36 file; tidak ada warning baru
dari komponen pengasuhan. Build produksi berhasil.

Server lokal dimuat ulang pada port 5152. Listener `0.0.0.0:5152` terverifikasi,
halaman login dan rute pengasuhan merespons HTTP 200 (tanpa sesi mengikuti
pengalihan login). Pemeriksaan tampilan berautentikasi dilakukan di server QA
salinan, bukan menggunakan akun uji pada database produksi.

Tidak ada perubahan izin pengasuhan, penugasan murid, narasi riwayat, validasi,
atau database produksi oleh pengujian. Tidak menambah dependensi UI baru.

## Penyempurnaan Responsif 27 Oktober 2026

Acuan dibaca sebelum perubahan: Rapkumer lokal `origin/main` pada commit
`1df6d3593d689466f3549f11a3130180652cf888`, khususnya tabel Data Murid
dan `src/lib/components/global-modal.svelte`. Ini referensi kode lokal,
bukan klaim pemeriksaan versi GitHub paling baru.

| Elemen                        | Ukuran atau pola                                           | Kepastian                                                  |
| ----------------------------- | ---------------------------------------------------------- | ---------------------------------------------------------- |
| Tabel Rapkumer                | `.table`, header `bg-base-200`, gulir horizontal internal  | Verified Rapkumer                                          |
| Tombol tabel                  | `btn-sm btn-soft`, tanpa shadow                            | Verified Rapkumer                                          |
| Popup                         | Maksimum 42rem, tinggi 85vh, isi `min-h-0 overflow-y-auto` | Verified Rapkumer                                          |
| Sidebar / navbar awal, 1440px | 280px / 64px                                               | Fallback Kaganga, diukur di browser                        |
| Judul / tabel awal            | 24px / 13px; header 44px; baris dua tingkat sekitar 66px   | Fallback Kaganga, diukur di browser                        |
| Kontrol / jarak sel / radius  | 40px / 12px vertikal dan 16px horizontal / 8px             | Fallback Kaganga, sumber CSS dan browser                   |
| Lebar halaman                 | Fluid sesuai area setelah sidebar; formulir tetap dibatasi | Fallback Kaganga, mengikuti persetujuan adaptif sebelumnya |

Baseline baru: `tmp/pengasuhan-qa-1793117972791/`, lima halaman pada
1440, 1024, 768, 390, dan 320px. Pada HP, navigasi tiga baris dan filter
empat tingkat menunda akses ke tabel. Perubahan difokuskan pada navigasi
satu baris yang dapat digulir, metrik tanpa posisi absolut, filter dua kolom
pada HP, pembagian tabel, dan pengelompokan formulir. Kontrak simpan,
penugasan, akses, dan database tidak diubah.

### Hasil Penyempurnaan

- Navigasi satu baris bergulir; tautan halaman aktif otomatis masuk area terlihat,
  tanpa menggulir halaman utama. Fokus dan label tautan tetap tersedia.
- Metrik menggunakan grid, bukan posisi absolut. Label panjang dan angka empat
  digit diuji tidak saling menimpa. Warna mengikuti token tema DaisyUI.
- Filter mengikuti lebar konten, bukan perkiraan jenis perangkat: dua kolom
  pada area sempit, pencarian dan tindakan selebar baris pada HP.
- Tabel minimum 52rem dengan kolom murid 25%, waktu 11rem, status 9rem,
  dan aksi 7rem. Tombol Detail tidak membungkus. Kolom identitas tetap terlihat
  saat tabel HP digeser, kecuali layar di bawah 390px agar ruang data mencukupi.
- Form tambah dikelompokkan menjadi Informasi Catatan dan Isi Catatan.
  Tanggal/waktu ditumpuk pada HP paling sempit; jam piket diberi jarak yang jelas.
  Lebar popup tetap maksimum 42rem, isi bergulir, footer tetap terlihat.

| Hasil ukur ringkasan             | Sebelum   | Sesudah  |
| -------------------------------- | --------- | -------- |
| Posisi awal header tabel, 1440px | 562.88px  | 539.88px |
| Posisi awal header tabel, 390px  | 1017.06px | 854.38px |
| Header tabel                     | 44px      | 44px     |
| Baris tabel desktop              | 65.89px   | 65.89px  |
| Tombol utama                     | 40px      | 40px     |

Posisi di atas adalah koordinat browser pada kondisi awal halaman, menggunakan
fixture yang sama pada salinan database; bukan ukuran dari Rapkumer.

Verifikasi akhir: `tmp/pengasuhan-qa-1793118928078/`, 99 screenshot dan
`ui-measurements.json`. Sebanyak 23 kelompok QA lulus pada lima halaman dan
delapan lebar layar: 2560, 1920, 1440, 1366, 1024, 768, 390, dan 320px.
Termasuk tabel bergulir dengan keyboard, visibilitas navigasi aktif, tombol utuh,
form simpan/gagal simpan, detail memuat/gagal dimuat, filter kosong, tema gelap,
label panjang, layar mendatar 844x390, fokus popup, dan footer tetap.

Lima unit test lulus. ESLint dan Prettier untuk berkas yang diubah lulus.
Pemeriksaan Svelte menghasilkan 0 error dan 117 warning lama di 36 berkas;
tidak ada diagnostik pada komponen Pengasuhan. Build produksi berhasil.
Server 5152 dimuat ulang dengan build akhir: login HTTP 200, listener
`0.0.0.0:5152`, dan log stderr kosong saat pemeriksaan. Port 1206 tidak disentuh.
