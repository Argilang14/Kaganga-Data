# Tab Asrama pada Absensi Hari Ini

| Elemen             | Sumber acuan                                                                   | Sebelum / perubahan                                                                                               | Kepastian                              |
| ------------------ | ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| Anatomi panel      | Rapkumer lokal `origin/main:src/lib/components/dashboard/progress-card.svelte` | Judul dan isi terpisah, memakai token tema; tidak mengubah shell                                                  | Verified source                        |
| Ringkasan Kaganga  | `daily-summary.svelte`, `dashboard.css`                                        | Label Murid menjadi Berangkat Sekolah; struktur data, font 14px dan progress tetap                                | Fallback Kaganga dari sumber           |
| Tab dashboard      | `daily-summary.svelte`                                                         | 3 menjadi 4 pilihan untuk akun yang diizinkan; HP memakai label 12px dengan lebar merata, ikon tampil mulai 640px | Fallback Kaganga; perlu uji 320-1920px |
| Ringkasan kegiatan | `activity-summary.svelte`                                                      | Komponen yang sama untuk tiga kegiatan Asrama; ikon disesuaikan                                                   | Verified source                        |
| Akses / data       | `availableMonitoringTabs`, `loadMonitoringSnapshot`                            | Reuse tab dan snapshot Monitoring; tim dapur tetap hanya Makan                                                    | Verified source                        |

Tidak mengubah kegiatan, aturan hadir/sakit/izin, hubungan sekolah-asrama,
atau hak mengisi absensi. Belum tercatat tetap bukan alfa. Nama Berangkat
Sekolah adalah perubahan label, sumber masuk sekolah tetap seperti sebelumnya.

## Hasil verifikasi

- Build, ESLint file tersentuh, dan pemeriksaan format berhasil. Pemeriksaan
  Svelte/TypeScript: 0 error, 116 warning existing di modul lain.
- QA memakai server terisolasi 5188 dan database salinan; fixture absensi
  Asrama tidak ditulis ke data server lokal yang dipakai pengguna.
- Ketiga ringkasan Asrama cocok dengan jumlah, status, dan kelengkapan dari
  endpoint Monitoring. Pilihan tab, popup murid, keyboard, dan refresh lulus.
- Akun tim dapur tetap hanya menerima Makan; permintaan tab Asrama ditolak 403.
- Tidak ada overflow halaman pada sembilan viewport 320-1920px. Empat tab
  tidak overflow pada 320, 390, 768, dan 1440px; tab desktop memakai padding
  horizontal 12px agar kontrol pembaruan tetap muat.
- Screenshot Asrama desktop 1440px dan HP 320px diperiksa secara visual.
  Artefak: `tmp/dashboard-ui-after-1793243089801/attendance-asrama-*.png`.
- Regresi grafik, kelas aktif jadwal, filter, dan batas akses akun juga lulus.
  Pengujian browser memakai Chrome headless, belum perangkat fisik.
- Server 5152 dimuat ulang; halaman login HTTP 200. Tidak membuat rilis baru.
