# Pengaturan Jadwal: audit UI 25 Oktober 2026

## Acuan dan batas perubahan

Rapkumer menjadi acuan struktur. Ukuran berikut berstatus **Fallback Kaganga**, diukur dari aplikasi lokal dan token `src/app.css`, bukan klaim ukuran upstream Rapkumer terbaru. Acuan lokal: halaman Kokurikuler, Data Murid, serta Jadwal Pelajaran yang sudah dirapikan. Tidak ada perubahan API, izin, database, atau aturan penyalinan jadwal.

| Komponen             | Sebelum                          | Sasaran                                     |
| -------------------- | -------------------------------- | ------------------------------------------- |
| Sidebar / navbar     | 280 / 64 px                      | Tetap                                       |
| Judul                | 24 px                            | 20 px, mengikuti halaman jadwal             |
| Kontrol utama        | 32 px                            | 40 px                                       |
| Kontrol tabel        | 24 px                            | 32 px                                       |
| Checkbox             | 20 px                            | 24 px, tidak menyusut                       |
| Tabel desktop 1440   | 889 px dalam pembungkus 771 px   | Gulir lokal, induk min-width 0              |
| Tabel HP 390         | Pembungkus 889 px, konten 351 px | Pembungkus mengikuti konten 351 px          |
| Panel kegiatan HP    | 925 px, turun setelah tabel      | Lebar mengikuti layar, bisa ditutup         |
| Popup jam / kegiatan | Maksimum 768 px                  | Tetap 768 px, judul dan body/footer seragam |
| Popup salin / impor  | Maksimum 1024 / 512 px           | Tetap, body bergulir terpisah dari footer   |
| Padding popup        | 24 desktop / 16 HP               | Token app-modal yang sama                   |
| Radius               | 8 px                             | Token app-radius                            |

Tangkapan sebelum: `tmp/jadwal-settings-ui-audit/`. Pengukuran 1440, 1024, 768, 390, dan 320 px. Pada HP tabel keluar dari grid; panel dan aksi tidak seluruhnya terjangkau. Filter tidak memiliki kelompok label-kontrol yang stabil.

## Pelaksanaan

1. Pengukuran dan acuan komponen.
2. Pembatas lebar grid dan gulir tabel lokal.
3. Header dengan nama tahun ajaran dan jenis jadwal.
4. Filter berlabel dalam grid responsif.
5. Kelompok tombol utama dan Excel.
6. Lebar kolom tabel eksplisit.
7. Kontrol tabel 32 px dan checkbox 24 px.
8. Panel kegiatan bisa dibuka-tutup; alat massal dipisahkan dari salin/default.
9. Empat popup memakai anatomi modal aplikasi.
10. Pengujian responsif dan fungsi pada database salinan.

Seluruh tahap di atas selesai.

## Temuan selama pengujian

Penyalinan slot terpilih kehilangan centang setelah POST pratinjau memuat halaman ulang. UI sekarang mengambil kembali `selectedJamIds` dari `copyRequest` yang sudah dikembalikan server. Aturan pemilihan sumber/tujuan, pemeriksaan konflik, serta penerapan salinan tetap di server yang sama. Uji membandingkan script dengan HEAD dan mengizinkan hanya penghapusan deklarasi tipe yang tidak digunakan serta pemulihan state centang tersebut.

Panel kegiatan memakai elemen `details` native di atas editor: ketika tertutup tabel tetap lebar penuh; ketika dibuka daftar menjadi tiga kolom desktop, dua kolom tablet, satu kolom HP. Tabel di HP tetap tabel dengan gulir horizontal lokal, bukan dipadatkan sampai isi tak terbaca.

## Hasil verifikasi

- Build adapter-node berhasil: `tmp/build-settings-ui-final.log`.
- ESLint halaman dan skrip QA: 0 masalah. `git diff --check` lulus.
- Svelte-check seluruh proyek: 0 error, 117 warning pada 36 file; jumlah warning sama dengan sebelum perubahan terakhir. Komponen ini tidak menghasilkan warning compiler.
- Tes logika JP, segmentasi, dan slot jadwal: 16/16 lulus.
- QA salinan database: `tmp/settings-ui-copy-H9ehWd/results.json`, PASS; 38 screenshot, 16 POST ke route pengaturan saja. Tambah/edit jam, aktif/nonaktif massal, salin slot terpilih setelah pratinjau, salin seluruh hari gabung/ganti ke beberapa hari/jenjang, konflik tanpa mutasi, tambah/edit kegiatan, impor baris valid dan melewati baris tidak valid, validasi waktu, filter, Cek Default, template dan ekspor Excel berhasil. Pemeriksaan isi database dilakukan hanya pada salinan.
- QA server lokal: `tmp/settings-ui-local-jQDPVE/results.json`, PASS; 31 screenshot, 0 POST tindakan pengaturan. Hanya login dan GET/HEAD diizinkan. Tampilan diuji pada lebar 1440, 1280, 1024, 768, 390, 320 px, termasuk mode gelap serta focus/Escape popup.
- Pengukuran sesudah di server lokal: pembungkus tabel desktop 1067 px; HP 390 px memiliki pembungkus 315 px dengan isi tabel 1024 px yang bisa digulir lokal. Checkbox 24 x 24 px, kontrol waktu tinggi 32 px, judul 20 px. Popup HP 374 x 717 px dengan footer tetap di dalam batas popup.
- Screenshot desktop, HP, panel kegiatan, popup, dan tabel yang digulir telah diperiksa secara visual. Tidak ada kontrol bertumpuk atau aksi tabel yang tidak terjangkau.
- Server aktif kembali pada `0.0.0.0:5152`, PID 13048; `/login` HTTP 200 dan halaman pengaturan berhasil dimuat setelah login. Log stderr kosong.

Tidak ada perubahan pada `+page.server.ts`, skema database, hak akses, maupun template PDF. Tidak membuat rilis atau push GitHub.
