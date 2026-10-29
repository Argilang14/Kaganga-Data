# Profil pegawai: audit UI

## Acuan sebelum implementasi

| Komponen         | Sumber                                                                               | Ukuran/perilaku                                                                                       | Kepastian                |
| ---------------- | ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- | ------------------------ |
| Form pengaturan  | Rapkumer lokal `origin/main:src/lib/components/settings/change-username-card.svelte` | Judul 20px, label terlihat, FormEnhance, tombol simpan di kanan                                       | Verified Rapkumer source |
| Shell Kaganga    | `src/app.css`                                                                        | Konten maksimum 80rem, navbar 64px, radius 8px                                                        | Verified Kaganga source  |
| Profil awal      | `settings/EmployeeProfile.svelte`                                                    | Identitas horizontal, 4 tab, input 40px, padding 16/20px                                              | Verified Kaganga source  |
| Kolom awal       | Komponen profil dan komponen Pendidikan/Dokumen                                      | Breakpoint viewport dapat menghasilkan kolom sempit; label lama `form-control` bukan layout DaisyUI 5 | Verified source          |
| Target form      | CSS lokal halaman profil                                                             | Input 40px, label 14px, jeda 16/20px; 1-3 kolom mengikuti lebar form                                  | Fallback Kaganga         |
| Target identitas | CSS lokal halaman profil                                                             | Ringkasan di atas pada HP/tablet, rail 232px pada ruang konten >=1040px                               | Fallback Kaganga         |
| Tabel            | PendidikanPegawai/DokumenPegawai existing                                            | Kolom tetap, scroll lokal; padding 12px, judul 12px, isi 14px                                         | Fallback Kaganga         |

Tidak mengubah schema, endpoint, izin profil sendiri, validasi, atau alur berkas.
Penyempurnaan komponen bersama dibatasi selector di dalam halaman profil.

## Hasil verifikasi

- Screenshot sebelum: `tmp/pegawai-profile-qa-1EyORz/`.
- Screenshot dan ukuran sesudah: `tmp/pegawai-profile-qa-xZVkfX/`, termasuk
  `responsive-biodata-1440.png`, `responsive-biodata-390.png`, empat tab,
  tema gelap, modal foto, serta `ui-measurements.json`.
- Chrome headless memeriksa empat tab pada 320, 390, 768, 1024, 1366, 1440,
  dan 1920px. Halaman dan kontrol form tidak overflow; tabel lebar tetap
  memakai scroll lokal. Input biodata tetap 40px.
- Screenshot desktop dan HP diperiksa secara visual. Belum diuji di perangkat
  fisik. Shortcut ringkasan, tombol tab via keyboard, dan nama panjang lulus.
- Regresi pada database salinan: simpan/muat ulang biodata, pendidikan,
  sertifikasi, berkas, foto, validasi, optimistic locking, audit, dan batas
  akses pemilik/sekolah lulus. Data pengguna tidak dipakai sebagai fixture.
- Build, ESLint berkas tersentuh, dan format lulus. Pemeriksaan Svelte:
  0 error, 116 warning existing di 35 berkas.
- Server pengembangan 5152 dimuat ulang dan login HTTP 200. Tidak menerbitkan
  rilis atau memperbarui server sekolah.
