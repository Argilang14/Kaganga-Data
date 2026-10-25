# Audit Pengaturan Martikulasi

Status: penyempurnaan UI diterapkan; verifikasi akhir tercatat di bagian Implementasi.

## Sumber

- Halaman: `src/routes/(kurikulum)/martikulasi/pengaturan/+page.svelte`.
- Kontrak data/tindakan: `+page.server.ts` pada folder yang sama. Ada simpan pengaturan, tambah/hapus tim, serta penerbitan nomor STTM; semuanya harus dipertahankan.
- Acuan lokal berkarakter Rapkumer: `src/routes/(informasi-umum)/murid/+page.svelte` untuk judul/tabel/aksi, `src/lib/components/global-modal.svelte` untuk anatomi popup, `src/app.css` untuk token, dan Pengaturan Jadwal yang baru dirapikan untuk konsistensi antarmenu.
- Referensi utama tetap Rapkumer. Angka di bawah adalah **Fallback Kaganga terukur lokal**, bukan hasil verifikasi upstream Rapkumer terbaru. Tidak ada instalasi framework atau dependensi baru.

## Pengukuran

Pengukuran browser pada lebar 1440, 1280, 1024, 768, 390, 320 px. Bukti: `tmp/martikulasi-settings-ui-audit/measurements.json` dan screenshot pada folder yang sama. Semua POST selain login diblokir; tidak menyimpan pengaturan, mengubah tim, atau menerbitkan nomor. Tidak ada galat JavaScript.

| Komponen               | Hasil sebelum perbaikan                                  | Target perbaikan                                                                                                     |
| ---------------------- | -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Shell                  | Sidebar 280 px, navbar 64 px mengikuti shell lokal       | Pertahankan                                                                                                          |
| Konten desktop 1440    | 1103 px                                                  | Tetap cair                                                                                                           |
| Judul                  | 24 px                                                    | 20 px, sama dengan Data Murid/Pengaturan Jadwal lokal                                                                |
| Input dan tombol utama | Tinggi 40 px, font 14 px                                 | Pertahankan; rapikan pengelompokan                                                                                   |
| Jarak form             | Grid 12 px, label gap 4 px + margin 4 px                 | Token jarak 8-16 px yang konsisten                                                                                   |
| Tabel desktop 1440     | 725 px; form samping 360 px                              | Tabel penuh lebar, tambah anggota melalui popup                                                                      |
| Tabel desktop 1280     | 565 px                                                   | Beri ruang nama, jabatan dan tugas                                                                                   |
| Tabel HP 390           | Isi 402 px, pembungkus 349 px                            | Pertahankan gulir lokal; kolom diberi batas minimum yang terbaca                                                     |
| Header tabel           | 46 px desktop, 43 px HP                                  | Sekitar 44-48 px, padding konsisten                                                                                  |
| Baris data             | Sekitar 66 px desktop, 79 px HP pada sampel satu anggota | Tinggi adaptif, NIP tetap di bawah nama                                                                              |
| Ikon hapus             | Menyusut ke lebar 6 px desktop / 2 px HP                 | Tombol persegi 32 px, ikon 16 px tidak menyusut                                                                      |
| Popup                  | Tidak ada popup di halaman sekarang                      | Usulan popup Tambah Anggota mengikuti app-modal; padding 24/16 px, radius token 8 px, body bergulir dan footer tetap |
| Panjang konten         | 1175 px desktop, 1868 px HP 390                          | Kurangi dengan memindahkan form tambah anggota ke popup                                                              |

## Prioritas Rekomendasi

1. Samakan header dan posisi pemilih tahun ajaran dengan halaman jadwal.
2. Kelompokkan form menjadi periode pelaksanaan dan dokumen SK/STTM tanpa memisahkan kontrak penyimpanannya.
3. Pertahankan kontrol 40 px; samakan label, jarak, dan posisi tombol simpan.
4. Jadikan tabel Tim Martikulasi penuh lebar dan letakkan tombol Tambah Anggota di header tabel.
5. Form Tambah Anggota menjadi popup dengan field, validasi, dan izin yang sama.
6. Atur kolom No, Nama/NIP, Jabatan Tim, Tugas, dan Aksi; nama/tugas panjang boleh membungkus.
7. Ganti simbol silang kecil dengan ikon hapus yang tidak menyusut, tooltip, dan konfirmasi sebelum menjalankan aksi hapus yang sama.
8. Ringkaskan penerbitan STTM: tanggal, jumlah hasil lengkap belum bernomor, serta kondisi tombol disabled yang jelas. Jangan mengubah urutan atau aturan penerbitan nomor.
9. Gunakan aksen warna semantik ringan pada judul bagian/status, tetap mengikuti tema terang/gelap. Tidak perlu banner besar atau dekorasi tambahan.
10. Uji desktop/tablet/HP, teks panjang, tabel kosong, loading/error/success, dan keyboard popup. Semua uji simpan/hapus/terbitkan harus memakai database salinan.

## Implementasi

- Header 20 px, pemilih tahun ajaran 40 px, dan jarak form 8-16 px mengikuti pengukuran lokal berkarakter Rapkumer.
- Satu form pengaturan dikelompokkan menjadi Periode Pelaksanaan dan Dokumen SK/STTM. Field, action, dan izin tetap sama.
- Tabel tim menggunakan lebar penuh. Pada layar kecil, tabel bergulir di pembungkusnya, bukan memperlebar halaman.
- Tambah Anggota menggunakan native dialog dengan anatomi app-modal: pilihan pegawai, jabatan, urutan, tugas, dan footer aksi. Mendukung Escape, Tab/Shift+Tab, serta pengembalian fokus.
- Aksi hapus berupa tombol persegi 32 px dengan ikon 16 px dan konfirmasi. Menghapus anggota tim tidak menghapus data pegawai.
- Penerbitan STTM dipisahkan secara visual, menampilkan jumlah hasil siap diterbitkan dan kondisi kosong. Aturan nomor dan kandidat tidak berubah.
- Tema memakai warna semantik DaisyUI; tidak ada framework, paket, API, schema, atau izin baru.
- Uji menemukan isian dinamis kembali ke data lama ketika validitas FormEnhance berubah. Binding form lokal diperbaiki agar nilai yang diketik tetap terbawa saat submit. Data dari server tetap menjadi sumber nilai awal/reset ketika pengaturan dimuat ulang.
- Uji mutasi hanya memakai database salinan melalui `scripts/test-martikulasi-settings-ui-copy.mjs`. Mode `MARTIKULASI_UI_LOCAL=1` memblokir mutasi selain login untuk pemeriksaan server aktual.

### Verifikasi

- Build produksi dengan adapter-node berhasil: `tmp/build-martikulasi-ui-verified.log`.
- Svelte check: 0 error, 117 peringatan yang sudah ada pada 36 berkas lain: `tmp/check-martikulasi-ui-verified.log`.
- Lint halaman dan skrip pengujian lulus; 5/5 tes `src/lib/martikulasi.test.ts` lulus.
- Uji browser build akhir lulus pada salinan database: `tmp/martikulasi-ui-copy-2miUrG/results.json` (33 screenshot, 5 POST terisolasi). Mencakup tahun ajaran belum diatur, pergantian tahun melalui dropdown, pengetikan langsung, simpan, validasi format ditolak, tambah/hapus anggota, pembatalan hapus tanpa POST, tim kosong, teks panjang, loading, serta penerbitan STTM dan kenaikan nomor urut 57 menjadi 58. Header tabel disembunyikan pada kondisi kosong di HP agar judul kolom tidak berdesakan; saat berisi, tabel tetap memakai gulir lokal.
- Lebar viewport yang diuji: 1440, 1280, 1024, 768, 390, 320 px; popup juga diuji pada 390 x 600 px dan tema gelap. Tidak ada overflow halaman, galat browser, atau request di luar cakupan.
- Hasil pengukuran: tabel 1101 px pada desktop 1440 (sebelumnya 725 px), 941 px pada desktop 1280 (sebelumnya 565 px); input 40 px, tombol hapus 32 px, ikon hapus 16 px. Popup desktop 672 x 468 px. Tinggi konten sampel 1078 px desktop dan 1702 px HP 390, lebih ringkas dari sebelumnya.
- Tidak menambah fitur edit anggota, aturan penomoran baru, atau perubahan hak akses.
- Kendala restart terselesaikan setelah proses lama dihentikan dan port kosong. Server build terbaru aktif pada `0.0.0.0:5152`, PID 12668; GET `/login` mengembalikan HTTP 200. Sebelumnya proses lama PID 21652 menyebabkan EADDRINUSE pada upaya menyalakan server kedua.
- Uji read-only server aktual lulus: `tmp/martikulasi-ui-local-vTMeME/results.json` (24 screenshot, 0 mutasi data). Header, form, tabel, popup, ukuran kontrol, gulir lokal, keyboard, dan tema gelap sudah diverifikasi dari build baru pada port 5152. Tidak ada galat browser atau request di luar cakupan.
