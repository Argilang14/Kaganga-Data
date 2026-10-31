# Data Asrama: halaman terpisah dan acuan Data Murid

## Audit sebelum perubahan

Rujukan utama: [Rapkumer](https://github.com/sira313/rapkumer), `src/routes/(informasi-umum)/murid/+page.svelte`,
`src/lib/components/menu.ts`, `src/lib/components/global-modal.svelte`.
Sumber upstream diperiksa baca-saja dari raw GitHub; tidak menjalankan atau
memasang kode repositori rujukan. Pola terverifikasi: panel `p-4 rounded-lg`,
judul `text-xl`, tabel berbatas tanpa zebra, submenu bertingkat, dan dialog
`sm:max-w-2xl` dengan batas tinggi 85vh. Sumber pembanding lokal:
`src/routes/(informasi-umum)/murid/+page.svelte`,
`src/lib/components/murid/modals.svelte`, `src/app.css`.

| Elemen           | Sumber / status                                             | Sebelum / target                                                               |
| ---------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Kerangka halaman | Verified Rapkumer source + Fallback Kaganga tokens          | Panel p16, radius8, judul20; tetap memakai shell yang ada                      |
| Sidebar / navbar | Fallback Kaganga, `src/app.css`                             | Sidebar280, navbar64; tidak mengubah komponen global                           |
| Tabel            | Verified Rapkumer structure; Fallback Kaganga dimensions    | Header base-200, tanpa zebra, padding dan ukuran font sama dengan Data Murid   |
| Lebar kolom      | Fallback Kaganga, Data Murid CSS                            | Nomor52, nama fleksibel, tanggal144, aksi104; disesuaikan isi domain           |
| Input / tombol   | Fallback Kaganga measured                                   | Sekitar40px; tidak memakai skala ukuran berdasarkan viewport                   |
| Dialog           | Verified Rapkumer max-w-2xl /85vh; Fallback Kaganga padding | Maks672px, p16, radius8, isi bergulir pada layar pendek                        |
| Responsif        | Data Murid lokal                                            | Workspace fluid terbatas asrama, tabel bergulir lokal, formulir tetap dibatasi |

Bukti sebelum: folder QA pada `tmp/dormitory-latest.json`,
`before-measurements.json`, screenshot Data Murid dan Data Asrama pada 1440/390.
Angka dari Kaganga bukan klaim ukuran live UI Rapkumer.

Pengukuran sebelum pada 1440px: tabel Data Murid 1069px, header49.5px,
baris57px, padding sel12/16px. Tabel asrama lama1101px, header46px,
baris67px. Pada390px, tabel Data Murid862px bergulir lokal, padding sel10.4/12px;
navbar56px. Dialog asrama sebelum: sekitar672px, padding16px, radius8px,
input/tombol40px. Semua ini **Fallback Kaganga measured**, bukan ukuran
upstream yang diasumsikan. Target memakai pola panel Data Murid sehingga
lebar efektif isi tabel sama, dengan baris tumbuh bila nama/keterangan membungkus.

## Susunan yang disepakati

Informasi Umum > Data Asrama mempunyai submenu sidebar:
Gedung / Blok, Kamar, Penghuni, Penugasan Wali, Riwayat, Penempatan Murid.
Masing-masing mempunyai URL `/asrama/<bagian>`, tidak memakai tab atau parameter
`view` sebagai navigasi utama. Tabel gedung tidak lagi disisipkan di bawah kamar.
Tautan lama `/asrama?view=...` tetap diarahkan ke halaman yang tepat.

Komponen tampilan boleh dipakai bersama untuk menjaga konsistensi, tetapi hanya
bagian yang diminta yang dirender. Tidak ada perubahan skema, data, autentikasi,
izin efektif, atau logika penempatan. Navigasi menyaring menu berdasarkan izin
yang sudah berlaku; pemeriksaan backend tetap dijalankan.

## Hasil

- Sidebar: enam halaman mandiri, tanpa tab horizontal dalam halaman. Menu dibatasi
  dengan izin yang sama seperti sebelum pemisahan.
- Pada 1440px, kedua tabel (Data Murid dan Kamar) sama-sama1071px termasuk border;
  pada390px sama-sama864px dengan gulir lokal. Padding sel sama pada kedua layar.
- Ukuran tabel, header, baris, dan padding Data Murid sebelum/sesudah identik.
  Filter kamar telah diverifikasi40px. Dialog tetap maksimal672px dan85dvh/850px.
- 371 unit test,15 skenario database salinan,15 skenario browser lulus.
- Semua halaman diperiksa pada320/768/1440; Kamar juga pada360/390/1024/1280/1366/1920.
  Popup diperiksa pada layar pendek768x390, termasuk keterjangkauan tombol bawah.
- Fokus keyboard dan gulir ke kolom aksi paling kanan berhasil. Default, kosong,
  gagal pratinjau, simpan, nonaktif, dan tema gelap tercakup pengujian.
- Build keluar0; pemeriksaan Svelte0galat/116peringatan lama; lint file terkait lulus.
- Server lokal dimuat ulang di5152. Login200, URL baru terlindungi303 saat belum
  login, dan hash entry aplikasi cocok dengan build baru.
- Dua belas tabel inti dibandingkan dengan backup awal: tidak ada perubahan data.

Bukti sebelum/sesudah dan pengukuran:
`tmp/dormitory-qa-XivWcD/before-measurements.json`,
`tmp/dormitory-qa-XivWcD/after-measurements.json` beserta screenshot pada folder itu.
Bukti akhir seluruh halaman dan alur pada `tmp/dormitory-qa-pH5sxa/ui-result.json`.
Data pada folder QA bukan data baru yang dimasukkan ke database operasional.
