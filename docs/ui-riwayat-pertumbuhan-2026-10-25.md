# Perapihan UI Riwayat Pertumbuhan

Tanggal: 25 Oktober 2026.

## Cakupan dan acuan

Permintaan: menerapkan perapihan Data Murid, Data Pegawai, dan Arsip Murid & Alumni pada Riwayat Pertumbuhan. Perubahan dibatasi pada halaman Svelte dan pengujian UI. Backend, perhitungan usia/status, penyaringan sekolah, database, format Excel, izin pengguna, serta rute tetap dipertahankan.

Acuan dimensi: **Fallback Kaganga, diukur dari implementasi lokal**, bukan klaim ukuran Rapkumer upstream. Sumber: `src/routes/(informasi-umum)/murid/+page.svelte`, halaman Pegawai dan Arsip, `src/app.css`, serta `docs/ui-data-murid-pegawai-audit-2026-10-25.md`. Pengukuran target dilakukan langsung sebelum perubahan pada server 5152. Salinan sumber awal dan bukti: `tmp/ui-growth-before-2026-10-25/`.

| Elemen | Acuan lokal | Sebelum | Implementasi |
| --- | --- | --- | --- |
| Shell | Sidebar 280 px, navbar 64 px desktop | Shell bersama | Tidak diubah |
| Permukaan halaman | Padding 16 px, radius 8 px, judul 20 px | Sudah sesuai; jarak 20 px | Padding/radius tetap, jarak 16 px |
| Filter | Label terpisah, kontrol 40 px | Panel tambahan berpading 16 px; pencarian 79 px pada layar 1280 px | Grid 1/2/5 kolom sesuai ruang, pencarian minimum 180 px di desktop |
| Ringkasan | Kompak, warna semantik | Komponen stats berpading lebar | Tiga kolom dengan batas pemisah dan angka 20 px; hitungan tetap |
| Tabel | Header sekitar 49,5 px, teks isi 14 px desktop | `table-sm`, minimum 1200 px, ukuran pakaian satu baris | Ukuran tabel standar, sebelas kolom tetap, minimum 1440 px, teks membungkus |
| Popup import | Maksimum 672 px, padding 16 px | Maksimum 512 px, padding 24 px desktop | Maksimum 672 px, padding 16 px, judul aksesibel dan batas tinggi 85dvh |

Lebar minimum tabel ditentukan dari sebelas kolom yang dipertahankan, bukan disamakan dengan tabel Murid yang memiliki kolom lebih sedikit. Tinggi, berat, dan Z-Score diratakan ke kanan. Ukuran pakaian dibungkus dalam selnya sendiri; catatan panjang tidak memperlebar tabel. Gulir horizontal berada pada wadah tabel, bukan seluruh halaman. Halaman ini tidak memiliki checkbox pemilihan.

Posisi awal tabel sebelum perapihan: y 390,75 px pada desktop 1440/1280 px, y 745,5 px pada tablet 768 px, y 813,5 px pada HP 390 px, dan y 864,25 px pada HP 320 px. Perubahan diuji dengan ukuran viewport yang sama.

## Import dan umpan balik

Field `file`, aksi `?/import`, metode multipart POST, dan perilaku mempertahankan nilai saat gagal tetap sama. Popup menampilkan error di dalamnya, memblokir pengiriman ganda selama proses, dan menunjukkan status sibuk. Escape/penutupan ditahan hanya selama permintaan import berjalan. Setelah gagal popup tetap terbuka, sedangkan sukses tetap menutup popup dan memperbarui data pada konteks filter yang sama.

Tidak menambahkan kategori kesehatan, kesimpulan medis, atau aturan penilaian baru. Warna status yang sudah ada tetap digunakan; status kosong menggunakan penanda netral.

## Verifikasi

- ESLint terfokus dan kompilasi Svelte komponen: lulus; kompilasi tidak menghasilkan peringatan.
- Skrip `scripts/test-growth-ui-copy.mjs` menguji lima ukuran viewport, isi panjang, popup native dan keyboard, filter/reset, endpoint template/export, serta import sibuk/gagal/berhasil pada salinan SQLite terpisah di port 5158. Mode `GROWTH_UI_LOCAL=1` hanya mengizinkan baca dan login pada server utama 5152.
- Hasil build dan pengujian akhir dicatat setelah selesai.

### Hasil akhir

- Build produksi dan adapter Node lulus. Server 5152 dimuat ulang dari build tersebut; HTTP `/login` 200 dan listener terverifikasi. Tidak ada error startup pada log server.
- Pemeriksaan Svelte: 0 error dan 116 peringatan di 35 berkas lain, sama dengan baseline. Komponen target dikompilasi tanpa peringatan. ESLint, Prettier terfokus, dan `git diff --check` lulus.
- Sepuluh kontrak nama field, aksi, metode, dan encoding formulir sama dengan salinan sumber awal, diverifikasi lewat AST Svelte.
- Tes salinan database lulus: `tmp/growth-ui-copy-5aJCW5/`, log `tmp/growth-ui-copy-final-test.log`. Enam fixture mencakup seluruh status gizi, nilai kosong, nama/catatan panjang, desimal koma, dan ukuran pakaian. Import diuji pada kondisi sibuk, file kosong/gagal, serta file valid/berhasil; filter tetap tersimpan dan integritas foreign key SQLite lulus.
- Tes baca pada server utama juga lulus: `tmp/growth-ui-local-grv5SU/`, log `tmp/growth-ui-local-test.log`. Tidak ada permintaan mutasi selain login. Screenshot mencakup lima ukuran layar, tema terang/gelap, popup, dropdown, dan data kosong.
- Pesan kosong kini berada di luar area lebar tabel agar terlihat langsung pada HP. Wadah tabel mempunyai nama aksesibel dan dapat difokuskan untuk gulir keyboard.

| Viewport | Awal tabel sebelum | Awal tabel sesudah | Lebar pencarian sesudah | Lebar popup sesudah |
| --- | --- | --- | --- | --- |
| 1440 px | 390,75 px | 331 px | 308,19 px | 672 px |
| 1280 px | 390,75 px | 331 px | 214,88 px | 672 px |
| 768 px | 745,5 px | 455 px | 337,5 px | 672 px |
| 390 px | 813,5 px | 655 px | 319 px | 374 px |
| 320 px | 864,25 px | 683 px | 249 px | 304 px |

Header tabel akhir 46 px di desktop dan 42,78 px di HP; perbedaan terhadap Murid wajar karena halaman ini tidak memiliki checkbox pada header. Padding popup akhir 16 px pada seluruh ukuran layar. Tidak ada overflow horizontal pada halaman; hanya tabel yang dapat digeser.

Tidak ada perubahan dependensi, CSS global, versi, installer, commit, push, atau rilis.
