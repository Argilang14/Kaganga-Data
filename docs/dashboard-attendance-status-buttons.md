# Status Absensi Hari Ini

## Audit dan acuan

| Elemen        | Acuan                                                                          | Ukuran/perilaku                                                  | Kepastian                                       |
| ------------- | ------------------------------------------------------------------------------ | ---------------------------------------------------------------- | ----------------------------------------------- |
| Panel         | Rapkumer lokal `origin/main:src/lib/components/dashboard/progress-card.svelte` | Anatomi judul/isi dipertahankan                                  | Verified source dari audit dashboard sebelumnya |
| Tombol status | Kaganga `dashboard.css`, `.dashboard-status-chip`                              | Tinggi minimum 30px, padding 4px 8px, radius 6px, teks 12px      | Fallback Kaganga, sumber lokal                  |
| Daftar murid  | `daily-summary.svelte`, `activity-summary.svelte`                              | Dialog DaisyUI `max-w-lg`, Escape/backdrop, 20 nama per tampilan | Verified source lokal                           |
| Responsif     | Komponen dashboard yang sama                                                   | Tombol membungkus sesuai lebar panel, bukan memperlebar halaman  | Perlu verifikasi browser                        |

## Perubahan

- Sekolah memakai label Berangkat Sekolah. Aset JavaScript yang disajikan
  localhost:5152 sebelum perubahan ini sudah memuat label tersebut; screenshot
  lama tidak cukup untuk memastikan browser masih memakai aset lama atau
  mengakses server sekolah yang belum diperbarui.
- Sakit, Izin, Alfa, Izin Pulang, dan Belum Tercatat selalu ditampilkan
  pada tiap kegiatan Sholat, Makan, dan Asrama, termasuk ketika jumlahnya nol.
- Sekolah mendapat tombol Belum Tercatat dan daftar murid dengan pagination.
  Status tanpa sumber juga masuk daftar belum tercatat, bukan alfa.
- Setiap kegiatan memakai snapshot Monitoring masing-masing, bukan menyalin
  angka sakit/izin dari ringkasan Sekolah. Hak akses dan data absensi tidak diubah.

## Verifikasi

- Build berhasil. Svelte/TypeScript: 0 error dan 116 warning existing.
- ESLint berkas tersentuh lulus; format dan whitespace diperiksa terfokus.
- QA Chrome headless pada database salinan lulus, tanpa fixture ditulis ke
  database pengguna. Sembilan viewport 320-1920px tidak overflow.
- Kelima tombol status tersedia pada setiap kegiatan, termasuk angka nol;
  popup kosong tetap berjudul sesuai status. Hitungan sesuai Monitoring.
- Popup Sekolah menampilkan nama murid belum tercatat dan halaman berikutnya
  tanpa menutup dialog. Jumlah nol dan pagination di luar batas juga diuji.
- Regresi filter, refresh, keyboard, grafik, jadwal kelas, dan pembatasan
  akun guru/tim dapur/sekolah lulus. Belum diuji di perangkat fisik.
- Artefak akhir: `tmp/dashboard-ui-after-1793247297195/`.
  Screenshot desktop 1440px dan HP 320px diperiksa secara visual pada putaran
  pertama: `tmp/dashboard-ui-after-1793247054254/attendance-asrama-*.png`.
- Server pengembangan 5152 dimuat ulang; login dan aset build HTTP 200.
  Aset yang disajikan memuat Berangkat Sekolah dan Belum Tercatat. Server
  sekolah dan rilis GitHub tidak diperbarui dalam pekerjaan ini.
