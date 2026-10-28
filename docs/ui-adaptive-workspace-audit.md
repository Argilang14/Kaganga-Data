# Audit halaman adaptif: Data Murid dan Pengasuhan

Lingkup: mode lebar opt-in pada layout, tabel Data Murid, dan workspace Pengasuhan.
Menu lain, ukuran cetak/PDF, API, izin, dan database tidak diubah.

## Acuan dan pengukuran sebelum implementasi

| Elemen         | Sumber                                                                                                      | Sebelum                                                         | Rencana                                                                        | Kepastian                                                                  |
| -------------- | ----------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| Konten utama   | Rapkumer `origin/main:src/routes/+layout.svelte`: `w-full max-w-7xl min-w-0 flex-1`                         | Kaganga membatasi konten 80rem                                  | Mode lebar untuk dua menu uji; menu lain tetap 80rem                           | Verified Rapkumer untuk struktur; lebar adaptif adalah permintaan pengguna |
| Sidebar/navbar | Kaganga `src/app.css` dan drawer layout                                                                     | 280px / 64px; sidebar lipat di bawah 1024px; navbar HP 56px     | Tidak berubah                                                                  | Fallback Kaganga                                                           |
| Tabel          | Rapkumer `origin/main:src/routes/(informasi-umum)/murid/+page.svelte`, `table` di wrapper `overflow-x-auto` | Lebar halaman terkendali; beberapa kolom berbasis persentase    | Scroll internal dan kolom singkat stabil, nama/catatan memanfaatkan sisa ruang | Verified Rapkumer untuk pola; ukuran kolom Fallback Kaganga                |
| Form/popup     | Rapkumer `origin/main:src/lib/components/global-modal.svelte`: `sm:max-w-2xl`, scroll body                  | Maksimal 42rem untuk form pengasuhan                            | Tetap; halaman lebar tidak memperbesar popup                                   | Verified Rapkumer dan Fallback Kaganga untuk penerapan                     |
| Font/kontrol   | Komponen Kaganga saat ini                                                                                   | Font tetap per jenis komponen, bukan berdasarkan lebar viewport | Tidak memakai zoom, transform scale, atau font berbasis vw                     | Fallback Kaganga                                                           |
| Jarak tepi     | Token `--app-page-gutter`                                                                                   | 16px; HP 12px                                                   | Tetap                                                                          | Fallback Kaganga                                                           |

Baseline browser: `tmp/pengasuhan-qa-1792947403682/`,
`adaptive-measurements.json` dan screenshot sebelum pada tujuh viewport.
Pengujian memakai salinan SQLite dan nama panjang buatan; tidak mengubah murid asli.

## Strategi penerapan

- Layout menyediakan token lebar yang diwariskan ke container dalam halaman.
  Opt-in hanya `/murid` dan lima halaman `/pengasuhan/...`; form mandiri, arsip,
  serta menu lain tidak ikut diubah.
- Ringkasan dan toolbar dibatasi agar tidak terlalu renggang; tabel memakai
  ruang kerja tersedia. Popup tidak memakai token lebar halaman.
- Data Murid mempertahankan urutan kolom, checkbox, pencarian, pagination,
  modal, dan aksi. Nama panjang membungkus. Pada HP kolom nama dapat tetap
  terlihat saat tabel digeser; status kosong tidak mengikuti lebar minimum tabel.
- Validasi 2560, 1920, 1366, 1024, 768, 390, dan 320px. Bandingkan screenshot
  setara, uji keyboard untuk scroll, popup, dan satu menu kontrol yang tetap 80rem.

## Hasil implementasi dan pemeriksaan

| Lebar viewport | Konten sebelum | Konten sesudah | Kolom nama Murid / Pengasuhan |
| -------------- | -------------- | -------------- | ----------------------------- |
| 2560px         | 1280px         | 2223px         | 480px / 480px                 |
| 1920px         | 1280px         | 1583px         | sekitar 465px / 403px         |
| 1366px         | 1029px         | 1029px         | sekitar 299px / 259px         |

Lebar diukur pada browser, termasuk sidebar dan ruang scrollbar. Font tombol
aksi tetap 12px pada seluruh viewport; halaman tidak memakai zoom atau font vw.
Kolom nama tabel beralih dari persentase ke batas 30rem saat area tabel melebihi
100rem melalui container query. Kolom tanggal/status/aksi tidak ikut membesar.

Pada HP di bawah 390px, kolom pengenal tidak dibuat sticky agar seluruh tombol
aksi masih dapat dijangkau. Pada Data Murid, area kosong dipisahkan dari tabel
lebar agar pesan tetap terlihat. Filter, checkbox, pagination dan modal tetap
menggunakan alur yang sama. Mode lebar tidak diwariskan ke halaman lain saat
navigasi; `/pegawai` tetap maksimal 1280px pada viewport 2560px.

Hasil akhir: `tmp/pengasuhan-qa-1792948423306/` berisi screenshot pembanding,
`adaptive-measurements.json`, dan `results.json`. Sebanyak 19 kelompok QA lulus,
termasuk batas akses pengasuhan dan simpan formulir pada salinan database,
gulir tabel dengan keyboard, nama panjang, pesan kosong, popup pada desktop/HP,
ukuran font stabil, dan tombol aksi yang tidak tertutup kolom sticky.
Pilih sebagian/pilih semua serta pencarian kosong lalu berisi kembali diuji;
referensi checkbox header memakai `$state` agar indikator pilihan tetap reaktif.

Build produksi dan ESLint tiga komponen terkait lulus. Pemeriksaan tipe akhir:
0 error, 117 warning lama di 36 file, tanpa warning baru dari perubahan ini.
Prettier serta `git diff --check` lulus. Server 5152 dimuat ulang, listener
`0.0.0.0:5152` dan HTTP 200 pada login terverifikasi.

Skill lokal `kaganga-ui-design` diperbarui menjadi v2.2 dengan referensi
`references/adaptive-layout.md`. Frontmatter YAML serta tautan referensi baru
divalidasi dengan parser YAML yang sudah tersedia pada proyek, tanpa dependensi baru.
