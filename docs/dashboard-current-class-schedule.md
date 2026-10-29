# Jadwal dashboard mengikuti kelas aktif

## Acuan

| Elemen               | Sumber                                                                         | Sebelum / sesudah                                                                         | Kepastian                  |
| -------------------- | ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- | -------------------------- |
| Struktur panel       | Rapkumer lokal `origin/main:src/lib/components/dashboard/progress-card.svelte` | Judul, isi dan informasi pendukung tetap terpisah                                         | Verified source            |
| Panel jadwal Kaganga | `today-agenda.svelte`, `dashboard.css`                                         | Radius 8px, header minimal 54px, judul 16px, padding isi 16px, teks pendukung 12px; tetap | Fallback Kaganga dari CSS  |
| Konteks kelas        | `+layout.server.ts`, `navbar.svelte`                                           | Pemilih kelas navbar sudah menghasilkan kelas aktif yang divalidasi server                | Verified source            |
| Isi jadwal           | `dashboard-daily.ts`                                                           | Seluruh kelas cakupan menjadi hanya kelas aktif yang masih termasuk kelas yang diizinkan  | Perubahan diminta pengguna |

Tidak mengubah desain panel, alur pengumuman, hitungan absensi, penugasan,
schema, atau izin. Nama kelas ditampilkan sebagai teks pendukung jadwal.
Kelas tidak valid tidak boleh menyebabkan fallback ke seluruh jadwal sekolah.

## Verifikasi

- Build produksi dan ESLint file tersentuh berhasil.
- Svelte/TypeScript seluruh proyek: 0 error; 116 warning existing di modul lain.
- QA server 5188 memakai database salinan. Dua kelas dengan jadwal uji berbeda
  cakupan memastikan query kelas eksplisit dan cookie kelas aktif memberikan
  kelas yang tepat, termasuk setelah navigasi kembali ke dashboard tanpa query.
- Kelas cookie tidak valid dan kelas di luar penugasan guru menghasilkan
  jadwal kosong; tidak kembali ke semua kelas. Akun guru tanpa penugasan
  juga tidak mendapat jadwal kelas lain.
- Pemeriksaan grafik, absensi, filter, pagination, pengumuman, dan batas sekolah
  tetap lulus. Tidak ada overflow halaman pada sembilan viewport 320-1920px.
- Screenshot panel jadwal 1440px dan 390px diperiksa:
  `tmp/dashboard-ui-after-1793242235433/current-class-schedule-1440.png` dan
  `tmp/dashboard-ui-after-1793242235433/current-class-schedule-390.png`.
- Browser yang diuji: Chrome headless (Puppeteer), belum perangkat fisik.
