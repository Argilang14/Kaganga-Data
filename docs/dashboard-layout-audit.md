# Dashboard: ukuran kartu dan penggunaan ruang

Perubahan 12 November 2026 terbatas pada tata letak dashboard. Data, akses role,
grafik, tautan, dan tindakan tetap mengikuti komponen yang sama.

## Acuan dan pengukuran sebelum perubahan

Acuan lokal Rapkumer diperiksa pada `../rapkumer/src/routes/+page.svelte`,
`../rapkumer/src/routes/+layout.svelte`, `../rapkumer/src/app.css`, dan
`../rapkumer/src/lib/components/dashboard/dashboard.css`.

| Bagian                | Acuan                         | Ukuran/perilaku                                            | Status                   |
| --------------------- | ----------------------------- | ---------------------------------------------------------- | ------------------------ |
| Sidebar/navbar        | Rapkumer `src/app.css`        | 17,5 rem / 4 rem                                           | Verified Rapkumer source |
| Konten                | Rapkumer `src/app.css`        | Maksimal 80 rem, gutter 1 rem; 0,75 rem pada ponsel        | Verified Rapkumer source |
| Kartu dashboard       | Rapkumer `dashboard.css`      | Jarak 12 px, isi 16 px, radius 8 px                        | Verified Rapkumer source |
| Header panel          | Rapkumer `dashboard.css`      | Minimum 54 px, padding 10 x 16 px                          | Verified Rapkumer source |
| Tombol tindakan cepat | Rapkumer `dashboard.css`      | Minimum 68 px; 2 kolom sempit, 3 kolom mulai konten 980 px | Verified Rapkumer source |
| Dashboard desktop     | Kaganga pada viewport 1440 px | Konten 1103 px; kiri 701 px, kanan 390 px; gap 12 px       | Measured Kaganga browser |
| Kartu penilaian bawah | Kaganga pada viewport 1440 px | Ringkasan 289 px, pengisian nilai 406 px, beda 117 px      | Measured Kaganga browser |
| Dashboard tablet      | Kaganga pada viewport 1024 px | Konten 687 px; panel pendamping masih satu kolom           | Measured Kaganga browser |

## Penyesuaian

- Pertahankan lebar halaman, warna, tipografi, radius, ukuran kontrol, dan isi panel.
- Pada lebar konten 580–979 px, panel utama memakai lebar penuh; tindakan cepat
  dan jadwal berbagi baris, begitu pula prestasi dan pengumuman. Data belum lengkap
  tetap lebar penuh. Kartu dalam satu baris sejajar tingginya.
- Pada desktop, pertahankan dua kolom utama Rapkumer. Susun empat progres nilai
  dalam dua kolom di kartu bawah agar tidak menyisakan ruang besar di bawah kartu
  ringkasan di sebelahnya. Pada konten sempit tetap satu kolom agar label terbaca.
- Gunakan tiga kolom tindakan cepat mulai lebar konten 580 px.
- Pertahankan urutan panel dan urutan fokus yang sudah berlaku; jangan memakai
  pemadatan otomatis yang memindahkan panel secara tak terduga.

Perubahan breakpoint panel pendamping dan tata letak progres merupakan penyesuaian
Kaganga atas permintaan pengguna, bukan ukuran upstream yang diklaim identik.

## Verifikasi

Screenshot dan pengukuran sebelum perubahan: `tmp/dashboard-layout/before-*`.
Screenshot sesudah perubahan: `tmp/dashboard-layout/after-*`, termasuk bagian bawah,
mode gelap, dan sekolah uji tanpa data. Browser memakai database salinan.

- Viewport 1920, 1440, 1280, 1024, 768, 390, dan 320 px: tidak ada overflow horizontal
  halaman atau galat JavaScript.
- Pada 1440 px, tinggi dashboard berkurang dari 1992 menjadi 1875 px; dua kartu
  penilaian bawah sama tinggi 289 px (sebelumnya 289 dan 406 px).
- Pada 1024 px, tinggi dashboard berkurang dari 3204 menjadi 2892 px. Pada ponsel,
  susunan satu kolom dipertahankan.
- Dialog status ketidakhadiran dapat dibuka dan ditutup dengan Escape; tombol
  muat ulang grafik dapat menerima fokus keyboard.
- ESLint komponen: 0 galat/peringatan; pemeriksaan Svelte terfokus: 0 galat/peringatan.
  Build produksi berhasil. Semua pemeriksaan berlaku pada sumber lokal.
