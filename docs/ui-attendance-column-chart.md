# Grafik batang kehadiran dashboard

Lingkup hanya grafik kehadiran tujuh hari. API, cakupan akses, pembilang,
penyebut, dan klasifikasi absensi tidak berubah. Tidak menambahkan paket atau
menyalin kode contoh daisyUI Charts berbayar; grafik dibuat dengan Svelte dan
token DaisyUI yang telah terpasang.

## Acuan sebelum implementasi

| Elemen         | Sumber                                                                         | Sebelum                                                    | Sasaran / kepastian                                                                               |
| -------------- | ------------------------------------------------------------------------------ | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Struktur panel | Rapkumer lokal `origin/main:src/lib/components/dashboard/progress-card.svelte` | Komponen dashboard terpisah                                | Pertahankan komponen, judul, isi dan warna tema; verified source, bukan ukuran upstream terbaru   |
| Judul / header | `dashboard/dashboard.css`                                                      | 16px / minimal 54px, padding 10px 16px                     | Tetap; fallback Kaganga dari CSS                                                                  |
| Plot           | `attendance-trend.svelte`, `dashboard.css`                                     | Garis, tinggi 128px; tanggal 10px; detail native SVG title | Batang kelompok, plot 144px, tanggal 11px; detail dapat diketuk dan difokuskan                    |
| Warna          | Token `--dashboard-blue/green/amber`                                           | SD biru, SMP hijau, SMA rose                               | SD biru, SMP hijau, SMA jingga; warna menyesuaikan tema                                           |
| Filter         | Belum tersedia                                                                 | Semua seri selalu tampil                                   | Select jenjang dan legenda toggle, tinggi kontrol 32px                                            |
| Responsif      | Shell Kaganga existing                                                         | Grafik mengikuti panel                                     | Semua jenjang memakai gulir lokal bila sempit; satu jenjang tanpa gulir wajib; ukuran huruf tetap |
| Data kosong    | `DashboardTrend`                                                               | `rate: null` memutus garis                                 | Penanda strip, berbeda dari batang 0%; tabel dan rincian tetap tersedia                           |

Pengukuran sebelum dan sesudah memakai server QA 5188 dan salinan database.
Tidak menulis fixture ke data server 5152 atau 1206. Uji keyboard, sentuh,
filter, legenda, nilai nol/null, tema gelap, error/retry, dan lebar 320-1920px.

## Hasil verifikasi

- Build produksi berhasil. Svelte/TypeScript: 0 error; pemeriksaan penuh masih
  melaporkan warning existing di modul lain. Peringatan tabindex grafik sudah
  diperbaiki; tombol batang tetap dapat diakses melalui keyboard.
- ESLint file tersentuh dan tiga unit test perhitungan tren lulus.
- QA salinan database lulus: 14 kelompok pemeriksaan, termasuk kecocokan
  ringkasan harian, cakupan akses, retry, tema, dan kontrol grafik.
- Sembilan viewport: 320, 360, 390, 430, 768, 1024, 1366, 1440, 1920px;
  tidak ada overflow halaman. Grafik semua jenjang memakai gulir lokal jika
  perlu; satu jenjang tetap muat di 320px.
- Fixture browser tiga jenjang memeriksa 21 titik, skala 144px untuk 100%,
  nol sebagai garis 2px, null sebagai strip tanpa batang, filter, legenda,
  fokus keyboard, ketukan, semua data null, dan tanpa seri. Fixture tidak
  disimpan ke database.
- Panel tetap bergap 12px. Tinggi plot berubah 128px menjadi 144px, tanggal
  10px menjadi 11px, dan rincian diberi tempat minimal 56px agar stabil.
- Kontrol regresi login tetap lebar 520px, font 16px, sama dengan baseline.
- Artefak baseline: `tmp/dashboard-ui-before-1793240278079/`.
  Hasil pengujian: `tmp/dashboard-ui-after-1793241338727/`; screenshot tema
  memakai tombol tema aplikasi, termasuk state checkbox theme-controller.
- Server lokal 5152: halaman login HTTP 200. Tidak mengubah API, izin,
  schema database, versi, atau rilis GitHub.

Pengujian browser menggunakan Chrome headless Puppeteer yang sudah tersedia;
belum menguji langsung Safari/iPad atau perangkat Android fisik.
