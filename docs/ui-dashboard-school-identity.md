# Audit dashboard School Identity

## Batas perubahan

Perapian dashboard saja: banner foto drone asli, statistik, susunan panel,
absensi hari ini, pengawasan kelas, prestasi, tindakan cepat dan panel pendukung.
Tidak mengganti navigasi global, membuat grafik tren, menambahkan pengumuman,
mengubah perhitungan/status absensi, schema database, autentikasi atau permission.

## Acuan sebelum implementasi

| Elemen             | Sumber                                                 | Ukuran/pola                                                                          | Kepastian                         |
| ------------------ | ------------------------------------------------------ | ------------------------------------------------------------------------------------ | --------------------------------- |
| Struktur aplikasi  | Rapkumer lokal `origin/main:src/routes/+layout.svelte` | drawer/sidebar dan navbar bersama; komponen dashboard terpisah                       | Verified Rapkumer, snapshot lokal |
| Struktur dashboard | `src/routes/+page.svelte`                              | komponen statistik, DailySummary, filter, kelas, prestasi, kelengkapan dan penilaian | Verified Kaganga                  |
| Sidebar/navbar     | `src/app.css`                                          | 17.5rem / 4rem                                                                       | Fallback Kaganga, token existing  |
| Lebar konten       | `src/app.css`                                          | maksimal 80rem; gutter 1rem                                                          | Fallback Kaganga, token existing  |
| Radius             | `--app-radius` dan `rounded-lg`                        | 8px                                                                                  | Fallback Kaganga, dipertahankan   |
| Padding panel      | Komponen dashboard existing                            | 16-20px; gap 12-16px                                                                 | Fallback Kaganga                  |
| Tabel kelas        | `class-attendance-summary.svelte`                      | `table-sm`, min-width 530px; daftar pada HP; pagination dan expand                   | Verified Kaganga                  |
| Dialog absensi     | `daily-summary.svelte`                                 | `modal-box max-w-lg`                                                                 | Verified Kaganga, tidak diganti   |
| Identitas visual   | Gambar/prompt pengguna dan login existing              | navy/biru, hijau/amber/rose semantik; foto asli                                      | Acuan pengguna                    |

Foto memakai `static/login/school-drone.jpg` yang diberikan pengguna. Logo
sekolah tetap dari `/sekolah/logo/:id`. Tidak menggunakan emblem atau gedung
ilustratif dari mockup. Font global tidak diganti.

## Sumber data yang dipertahankan

- `src/routes/+page.server.ts`: statistik dan progress existing.
- `dashboard-daily.ts` dan `/api/dashboard/daily`: snapshot, sumber kegiatan,
  pengisian absensi, absensi pegawai, tab sholat/makan, pagination dan scope.
- `dashboard-achievements.ts`: rapor semester dan kehadiran masuk sekolah.
- `dashboard-leadership.ts`: ringkasan penilaian dan dokumen sesuai izin.
- `quick-actions-card.svelte`: backup/import dengan pemeriksaan izin existing.

Grafik tren tidak ditampilkan karena kontrak dashboard belum menyediakan seri
historisnya. Tidak ada persentase aktif fiktif. Tercatat tetap berarti kelengkapan
pengisian, bukan persentase hadir. NPSN umum sekolah terintegrasi tidak dipakai
untuk mewakili semua jenjang.

## Hasil implementasi

- `src/routes/+page.svelte`: susunan banner, lima ringkasan utama, absensi dan
  tindakan cepat, pengawasan kelas/prestasi, lalu ringkasan nilai.
- `welcome-banner.svelte`: foto asli dan logo sekolah aktif; tanggal dan cakupan
  memakai data existing.
- `dashboard.css`: warna dan tata letak khusus dashboard. Container query
  mengikuti lebar konten, bukan nama perangkat; radius tetap 8px.
- `sekolah-overview-card.svelte` dan `rombel-murid-stats.svelte`: identitas dan
  statistik lebih ringkas; NPSN sekolah terintegrasi diberi keterangan per satuan.
- `daily-summary.svelte`: susunan grid dan angka kelengkapan sejajar, tanpa
  mengganti handler, refresh, sumber kegiatan atau popup.
- `class-attendance-summary.svelte`: tabel dapat digeser dengan keyboard;
  persentase daftar HP diberi label "tercatat".
- `quick-actions-card.svelte`: pintasan hanya muncul jika menu diizinkan.
  Backup/import mempertahankan pemeriksaan izin. Export Dapodik yang sebelumnya
  hanya membuka pemberitahuan belum tersedia kini dinonaktifkan secara jelas.

Sidebar, navbar, font global, autentikasi, endpoint dan query tidak diubah.
Tidak memasang dependency baru. Gaya login tetap terpisah dari dashboard.

## Pengukuran browser

Diukur melalui Chrome headless, skala CSS 1, tinggi desktop 1080px/HP 900px.
Angka desimal dibulatkan pada tabel. Lebar sidebar tetap 280px, navbar 64px.

| Elemen                           | Sebelum               | Sesudah      | Kepastian        |
| -------------------------------- | --------------------- | ------------ | ---------------- |
| Konten pada viewport 1440px      | 1103px                | 1103px       | Measured Kaganga |
| Konten pada viewport 1920px      | 1280px                | 1280px       | Measured Kaganga |
| Banner pada viewport 1440px      | 100px tinggi          | 180px tinggi | Measured Kaganga |
| Banner pada viewport 390px       | 144px tinggi          | 208px tinggi | Measured Kaganga |
| Tabel kelas pada viewport 1440px | 650px lebar           | 650px lebar  | Measured Kaganga |
| Judul panel absensi              | 18px                  | 16px         | Measured Kaganga |
| Radius banner/panel              | 8px                   | 8px          | Measured Kaganga |
| Halaman kontrol login            | card 520px, font 16px | sama         | Measured Kaganga |

Pada konten minimal 980px: ringkasan lima kolom, absensi/tindakan cepat 2:1,
kelas/prestasi 3:2. Pada konten 580-979px: ringkasan membungkus menjadi dua
baris, panel utama bertumpuk. Pada HP: identitas sekolah memenuhi satu baris,
statistik dua kolom, lalu absensi, tindakan cepat, dan panel lanjutan. Tabel
kelas menjadi daftar pada lebar viewport di bawah 640px.

## Verifikasi 28 Oktober 2026

- `pnpm build`: lulus.
- `pnpm check`: 0 error, 117 peringatan existing dalam 36 file.
- ESLint file Svelte dan skrip yang diubah: lulus.
- Uji existing dashboard summary/achievements/leadership dan role-menu-access:
  21 lulus, 0 gagal.
- `scripts/qa-dashboard-ui-copy.mjs`: lulus pada 1920, 1440, 1366, 1024, 768,
  430, 390, 360 dan 320px. Tidak ada overflow horizontal halaman atau galat JS.
- Snapshot API absensi sama dengan baseline, kecuali `generatedAt` yang memang
  berubah setiap pemuatan. Salinan database dipakai untuk seluruh fixture akun.
- Tab sekolah/sholat/makan, sumber absensi, filter jenjang, pagination kelas,
  popup/Escape, loading/gagal/pulih saat refresh dan fokus keyboard: lulus.
- Akun guru tanpa penugasan tidak mendapat cakupan pimpinan atau backup.
- Mode gelap desktop/HP dan halaman kontrol login diperiksa. Screenshot akhir
  HP diambil setelah animasi drawer selesai.
- Server 5152 dimuat ulang dan `/login` serta foto drone mengembalikan HTTP 200.
  Server port 1206 tidak disentuh. Tidak membuat rilis atau push GitHub.

Artefak lokal (tidak untuk diunggah karena memakai salinan data sekolah):

- Sebelum: `tmp/dashboard-ui-before-1793157023834/`.
- Sesudah: `tmp/dashboard-ui-after-1793159070202/`.
- Screenshot: `dashboard-1440.png`, `dashboard-390.png`,
  `dashboard-class-panels.png`, `tab-sholat.png`, `tab-makan.png`,
  `dashboard-dark-1440.png`, `dashboard-dark-390.png`, `absence-dialog.png`,
  `attendance-loading.png`, `attendance-error.png`.
- Log build/check/unit test: `tmp/dashboard-{build,check,unit-tests}.log`.

Lint seluruh repo tidak dijadikan klaim lulus: pemeriksaan sebelumnya masih
terhalang HTML/formatting lama pada dokumen di luar pekerjaan ini. Tidak
melakukan format massal atau memperbaiki modul lain.

## Pemeriksaan manual tersisa

Uji kenyamanan sentuh dan zoom pada HP/tablet fisik; tinjau akun sekolah dengan
variasi jabatan/penugasan nyata. Backup/import sungguhan tidak dijalankan karena
bersifat administratif. Grafik tren, menu bawah HP, pencarian global dan
pengumuman dari mockup tidak ditambahkan pada lingkup perubahan ini.

Grafik, jadwal harian, pengumuman dan pemadatan lanjutan kemudian ditambahkan
dalam [penyempurnaan dashboard](ui-dashboard-compact.md).
