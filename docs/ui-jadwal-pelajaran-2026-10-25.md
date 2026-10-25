# Perapihan UI Jadwal Pelajaran

Tanggal: 25 Oktober 2026. Sasaran: `/rapor/jadwal-pelajaran`.

## Acuan dan pengukuran sebelum implementasi

Status ukuran: **Fallback Kaganga, diukur pada aplikasi lokal**, bukan klaim ukuran
Rapkumer upstream terbaru. Sumber pola lokal adalah
`src/routes/(mata-pelajaran)/kokurikuler/+page.svelte`,
`src/lib/components/kokurikuler/form-modal.svelte`, `src/app.css`, dan pengukuran
`docs/ui-kokurikuler-data-mapel-audit-2026-10-25.md`.

| Elemen         | Bukti acuan lokal                     | Jadwal sebelum                         | Rencana                                                           |
| -------------- | ------------------------------------- | -------------------------------------- | ----------------------------------------------------------------- |
| Sidebar/navbar | 280 / 64 px desktop                   | Sama                                   | Tidak diubah                                                      |
| Judul          | 20 px                                 | 20 px; lebar tinggal 82 px pada tablet | Baris mandiri, tidak terdesak filter                              |
| Kontrol        | Tinggi 40 px                          | Filter 32 px, tombol utama 40 px       | Filter 40 px; kontrol kepadatan tetap ringkas                     |
| Panel          | Padding 16, radius 8 px               | Header dan workspace terpisah          | Pertahankan alat kerja berbingkai, tanpa kartu dekoratif tambahan |
| Pemeriksaan    | Warna status semantik                 | Tinggi 170 px desktop / 262 px HP      | Ringkasan ringkas, detail dapat dibuka                            |
| Tabel          | Font 14 px untuk tabel administrasi   | Matriks 1799 px pada mode padat        | Matriks khusus: kode 12-13, nama 11-12 px, gulir di dalam tabel   |
| Area tabel     | Gulir lokal, halaman tidak melebar    | Tinggi 2556 px desktop / 3328 px HP    | Tinggi terbatas viewport agar panel item tetap dekat              |
| Panel item     | Struktur pencarian/tab/daftar         | Lebar 240 px desktop; y=4071 pada HP   | Desktop di samping; HP/tablet dapat dibuka tepat sebelum tabel    |
| Popup biasa    | Form lokal max 672, konfirmasi 448 px | Edit/drop max 448 px                   | Edit max 672, pilihan drop 448; judul 18, padding 24/16           |
| Target JP      | Matriks perlu ruang tersendiri        | Max 1280; HP 374 px                    | Pertahankan lebar matriks dan gulir, footer selalu terjangkau     |
| Impor          | Preview perlu tabel lebar             | Max 1024 px                            | Pertahankan lebar, tubuh gulir dan footer konsisten               |

Pengukuran sebelum: `tmp/jadwal-layout-audit/measurements.json` dan screenshot
1440, 768, 390 px. Pengujian setelah mencakup 1440, 1280, 1024, 768, 390, 320 px.

## Batas perubahan

- Hanya halaman Svelte jadwal dan QA/dokumentasi terkait.
- Tidak mengubah server actions, API, schema, izin, perhitungan JP, aturan slot,
  deteksi bentrok, segmentasi/penggabungan blok, payload simpan, atau cetakan.
- Tambahan state hanya untuk visibilitas panel item pada layar kecil.
- Warna sumber mapel/kegiatan tetap sama; penyajian sel menggunakan tint dan
  penanda warna agar teks terbaca dalam tema terang maupun gelap.
- Uji mutasi hanya pada database salinan. Server 5152 diuji baca saja, selain login.

## Hasil validasi

- Tahap 1-9: header, filter, tombol, pemeriksaan, tabel, warna, panel item, dan
  empat dialog selesai. Tahap 10: uji fungsi pada salinan database dan pemeriksaan
  baca saja pada server lokal selesai.
- `scripts/test-jadwal-ui-copy.mjs`: uji enam viewport (1440, 1280, 1024, 768,
  390, 320), tema gelap, gulir tabel, header tidak tertutup sel, pencarian kosong,
  dropdown, Escape dan kembalinya fokus, posisi/kondisi panel, serta popup pada
  HP pendek 320x600. Sebanyak 33 screenshot dihasilkan pada pengujian salinan.
- Fungsi yang diuji pada salinan: edit sel tetap berupa draf, drag-and-drop,
  simpan jadwal dan muat ulang, simpan target JP, impor berkas dengan header salah,
  pratinjau baris valid/tidak valid, penerapan impor, dan kosongkan draf tanpa
  menyimpan. Status menyimpan diuji dengan respons jaringan yang ditunda.
- Database salinan lulus `PRAGMA quick_check` dan `foreign_key_check`.
- Isi script bisnis dibandingkan dengan HEAD menggunakan formatter TypeScript:
  sama, kecuali state visibilitas panel mobile dan penyajian warna sel.
- Bukti fungsi salinan: `tmp/jadwal-ui-copy-2oTDON/measurements.json`.
- Pemeriksaan lokal hanya GET/HEAD dan login, tanpa POST tindakan jadwal.
  Pemeriksaan ulang build terakhir lulus dengan 27 screenshot:
  `tmp/jadwal-ui-local-VQ71vw/measurements.json`. Tinggi tombol dalam setiap baris
  pada HP diuji sama, termasuk ketika label membungkus pada 320 px.
- Server utama dimuat ulang pada port 5152; listener `0.0.0.0:5152` dan HTTP 200
  halaman login serta jadwal terverifikasi. Server QA salinan sudah dihentikan.
- Unit test jadwal: 16/16 lulus. Build produksi berhasil. Pemeriksaan Svelte:
  0 error, 117 warning lama pada 36 file. Kompilasi komponen yang diubah: 0 warning.
- Format Prettier dan lint script QA lulus. ESLint halaman masih memiliki enam
  temuan lama: tiga variabel/fungsi tidak terpakai, dua tautan dinamis tanpa
  `resolve()`, satu each tanpa key. Perbandingan lint HEAD terhadap hasil perubahan
  menghasilkan daftar temuan yang sama, tanpa tambahan. Bukti:
  `tmp/lint-jadwal-ui-baseline.log`. Lint seluruh repo tidak diklaim bersih.

### Perbandingan ukuran

| Elemen                         | Sebelum                        | Sesudah                              |
| ------------------------------ | ------------------------------ | ------------------------------------ |
| Lebar judul pada tablet 768    | 82 px, tinggi 56 px            | 687 px, tinggi 28 px                 |
| Tinggi ringkasan desktop       | 170 px                         | 97 px, detail dapat dibuka           |
| Tinggi ringkasan HP 390        | 262 px                         | 123 px                               |
| Filter tahun/jenis             | 32 px                          | 40 px                                |
| Panel item HP 390              | Setelah tabel, y=4071          | Saat dibuka, sebelum tabel, y=358    |
| Area tabel desktop             | 2556 px, mengikuti semua baris | 650 px dengan gulir internal         |
| Area tabel HP 390x844          | Mengikuti semua baris          | Sekitar 549 px dengan gulir internal |
| Lebar halaman 1440/768/390/320 | Tidak melebar                  | Tetap sesuai viewport                |

Ukuran sesudah diukur pada server 5152. Matriks tetap dapat digeser horizontal;
kolom tidak dipaksa mengecil agar seluruh jenjang muat dalam satu layar HP.
