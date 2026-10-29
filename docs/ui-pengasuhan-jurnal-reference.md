# Pengasuhan dengan acuan Jurnal Mengajar

Lingkup: lima halaman Pengasuhan & Asrama dalam `PengasuhanWorkspace.svelte`.
API, database, penugasan, izin, dan alur simpan tidak diubah.

## Acuan sebelum perubahan

- Verified Rapkumer (kode lokal `origin/main`): `src/routes/(input-nilai)/jurnal-mengajar/+page.svelte`; judul `text-xl`, workspace `p-4`, tombol utama `btn-primary btn-soft`, filter kontrol standar, tabel `.table`, header `bg-base-200`, aksi `btn-sm btn-soft`, pagination di bawah tabel.
- Verified Rapkumer: `src/lib/components/global-modal.svelte`; judul 18px, lebar maksimum `42rem`, tinggi maksimum `85vh`, isi `min-h-0 overflow-y-auto`, footer tidak menyusut.
- Fallback Kaganga, diukur dari UI berjalan pada salinan database: `tmp/pengasuhan-qa-1793187564969/journal-reference.json`. Bukan klaim ukuran versi Rapkumer terbaru dari internet.

| Bagian                  | Acuan / kepastian                                               | Sebelum pada Pengasuhan                     | Sasaran                                             |
| ----------------------- | --------------------------------------------------------------- | ------------------------------------------- | --------------------------------------------------- |
| Viewport                | Fallback Kaganga, diukur pada 1440/1024/768/390px               | Audit lima halaman pada 8 lebar             | Pertahankan lebar adaptif                           |
| Sidebar / navbar 1440px | Fallback Kaganga, diukur 280 / 64px                             | Sama                                        | Tidak diubah                                        |
| Workspace               | Verified Rapkumer `p-4`, radius `rounded-lg`                    | Header terpisah di luar bidang tabel        | Satu bidang kerja putih, tanpa kartu bersarang      |
| Judul                   | Verified Rapkumer `text-xl`; Kaganga Jurnal terukur 20px        | 24px dengan ikon/eyebrow terpisah           | 20px, konteks tepat di bawah judul                  |
| Tombol / input          | Fallback Kaganga Jurnal terukur 40px, font 14px                 | Tinggi 40px, font 13px, tombol utama solid  | 40px / 14px, tombol utama soft                      |
| Tabel                   | Verified Rapkumer `.table` dan header berwarna                  | Header 44px/12px, data 13px, avatar inisial | Header sekitar 46px/14px, data 14px, identitas teks |
| Sel                     | Fallback Kaganga Jurnal terukur 12px vertikal / 16px horizontal | 12px / 16px                                 | Pertahankan; baris menyesuaikan metadata            |
| Kolom                   | Fallback Kaganga, data pengasuhan berbeda dari jurnal           | Murid, catatan, waktu/petugas, status, aksi | Urutan tetap; scroll hanya di pembungkus tabel      |
| Ringkasan kasus         | Fallback Kaganga                                                | Tiga kartu, 96px desktop / 3 tingkat HP     | Band ringkas, tetap 3 indikator dan tautan filter   |
| Popup                   | Verified Rapkumer 42rem / 85vh; token Kaganga 24px padding      | Header dengan ikon, footer tetap            | Judul sederhana, kontrol 14px, footer tetap         |
| Responsif               | Fallback Kaganga, pola adaptif disetujui                        | Halaman fluid                               | Lebar halaman tetap; form/popup tetap dibatasi      |

Screenshot sebelum: `tmp/pengasuhan-qa-1793187564969/`, termasuk empat screenshot acuan Jurnal.
Pengukuran baris Jurnal saat audit adalah keadaan kosong (77px), bukan target tinggi baris data.

## Hasil verifikasi

Penyesuaian gutter: layout utama sudah menyediakan `app-page-padding`. Wrapper
Pengasuhan tidak mengulang padding tersebut; padding isi workspace tetap 16px
(14px pada HP). Ini menyamakan posisi bidang kerja dengan Jurnal Mengajar tanpa
mengubah shell atau lebar halaman lain.

Artefak akhir: `tmp/pengasuhan-qa-1793188580774/`. Uji memakai salinan database
dan server terpisah pada port 5186; data produksi tidak dipakai untuk menulis fixture.

- 25 kelompok uji lulus, mencakup lima halaman pada 2560, 1920, 1440, 1366,
  1024, 768, 390, dan 320px; tidak ada overflow halaman atau galat JavaScript.
- Screenshot desktop 1440px dan HP 390px diperiksa langsung. Tabel lebar tetap
  dapat digulir dalam pembungkusnya tanpa memperlebar halaman.
- Pada 1440px: judul 20px, tombol utama 40px, header tabel 46px dengan teks
  14px dan padding 12px x 16px. Baris fixture 67,39px; awal tabel pada y=442,30px.
- Pada 390px: judul 20px, tombol 40px, header 46px/14px; baris fixture 64,17px.
  Tinggi baris mengikuti isi, bukan dipaksakan sama dengan keadaan kosong Jurnal.
- Form tambah/detail/piket, simpan berhasil/gagal, draf, loading/error, tema gelap,
  label panjang, keyboard, fokus popup, dan layar mendatar pendek lulus.
- Pembatasan penugasan, akses lintas sekolah, serta absensi/nilai/rapor lulus.
  Pengukuran halaman kontrol Jurnal identik dengan baseline pada empat viewport.
- Build berhasil; ESLint komponen dan `git diff --check` lulus. Lima unit test
  pengasuhan lulus. Svelte-check: 0 galat dan 116 peringatan lama pada 35 file.
- Server utama 5152 dimuat ulang; `/login` merespons 200 dan halaman Pengasuhan
  tanpa sesi merespons 303. Port 1206 tidak diubah. Tidak ada rilis atau perubahan versi.
