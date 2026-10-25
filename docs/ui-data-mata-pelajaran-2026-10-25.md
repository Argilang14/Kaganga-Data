# Perapihan UI Data Mata Pelajaran

## Acuan dan Batas

Mengikuti ukuran menu lokal Kokurikuler yang sudah diukur dalam `docs/ui-kokurikuler-data-mapel-audit-2026-10-25.md`. Status acuan: **Fallback Kaganga, terukur pada aplikasi lokal**, bukan klaim pengukuran Rapkumer upstream terbaru.

Perubahan aplikasi hanya pada `src/routes/(informasi-umum)/data-mata-pelajaran/+page.svelte`. Isi script tetap sama dengan versi sebelum perubahan. File server, skema, izin, endpoint, nama field, serta action simpan/impor/hapus tidak diubah. Master mata pelajaran tetap berada pada lingkup sekolah, bukan dibatasi kelas aktif.

## Hasil Ukur

| Komponen | Sebelum | Sesudah | Acuan Kokurikuler |
| --- | --- | --- | --- |
| Judul halaman | 24 px | 20 px | 20 px |
| Padding panel utama | Terpisah antara kepala/filter/tabel | 16 px | 16 px |
| Radius panel dan popup | 8 px | 8 px | 8 px |
| Checkbox tabel | 20x20 px | 24x24 px, tidak menyusut | 24x24 px |
| Tombol aksi baris | 24x24 px | 38x32 px | 38x32 px |
| Lebar popup tambah/edit desktop | 896 px | 672 px | 672 px |
| Lebar popup impor desktop | 512 px | 672 px | 768 px, dengan pratinjau |
| Padding popup desktop / HP | 24 / 16 px | 24 / 16 px | 24 / 16 px |
| Tinggi kontrol isian / warna | 40 / 48 px | 40 / 40 px | Input 40 px |
| Menu Excel | 240 px, padding 8 px | 192 px, padding 4 px | 192 px, padding 4 px |

Popup impor target tidak diperlebar sampai 768 px karena hanya memiliki unggahan berkas, tanpa tabel pratinjau. Popup tambah/edit tetap native `showModal()` agar fokus dan Escape berfungsi; kekurangan fokus pada modal Kokurikuler tidak disalin.

## Susunan Tampilan

- Kepala halaman ringkas, jumlah mapel, serta tindakan Excel, Tambah Mapel, dan Jadwal Pelajaran.
- Filter satu kolom pada HP, dua kolom mulai 640 px, dan satu baris empat kolom mulai 1280 px. Semua label memiliki jarak eksplisit dan kontrol setinggi 40 px.
- Tabel tetap sembilan kolom, dengan pembagian lebar yang stabil dan minimum 1040 px. Pada desktop 1440 px seluruh kolom termasuk Aksi terlihat. Pada laptop lebih kecil, tablet, dan HP, gulir horizontal hanya berada di pembungkus tabel.
- Kepala tabel memakai warna dasar tema. Warna mapel tetap terlihat sebagai swatch kecil di sebelah kode, sehingga teks tidak harus ditampilkan di atas warna pilihan pengguna.
- Menu Excel rata kiri pada susunan toolbar kecil, kemudian rata kanan pada desktop. Dropdown berada di dalam viewport pada lima ukuran yang diuji.
- Pesan hasil kosong berada di luar tabel lebar sehingga tidak perlu menggeser tabel untuk membacanya.
- Tambah/edit memakai dua kolom mulai 768 px dan satu kolom pada HP. Catatan tetap selebar form; footer Batal lalu Simpan mempertahankan perilaku sticky pada HP.
- Judul modal terhubung melalui `aria-labelledby`; unggahan Excel memiliki label; tombol aksi ikon memiliki nama aksesibel. Konfirmasi hapus native browser tetap dipertahankan.

## Verifikasi

- Build produksi berhasil. Svelte check: 0 error dan 117 warning pada keseluruhan proyek; kompilasi komponen yang diubah tidak menghasilkan warning.
- ESLint terfokus dan pemeriksaan Prettier lulus. Script UI sebelum/sesudah dibandingkan secara langsung dan tidak berubah.
- `scripts/test-mapel-ui-copy.mjs` menguji 1440x1000, 1280x1000, 768x1000, 390x844, dan 320x844; halaman, dropdown, popup, Escape, pesan kosong, kontrol tabel, serta mode gelap.
- Pengujian database salinan lulus untuk tambah/edit, penolakan kode ganda, impor tidak valid/valid, pembatalan hapus, hapus tunggal/massal, `integrity_check`, dan `foreign_key_check`. Data nama panjang tanpa spasi dan status nonaktif tersedia dalam fixture salinan.
- Artefak pengujian salinan: `tmp/mapel-ui-copy-rnsjHw/`. Artefak verifikasi baca-saja awal pada server pengguna: `tmp/mapel-ui-local-CR4XQG/`. Isi data baris dan pilihan guru disamarkan pada screenshot.
- Pengulangan verifikasi pada server 5152 juga lulus: `tmp/mapel-ui-local-5l3JyE/`. Pengujian tambahan memastikan textarea Catatan dapat digulir hingga terlihat penuh di atas footer pada layar 390 dan 320 px.
- Server pengguna tetap pada port 5152 dengan build baru. Pengujian mutasi hanya dijalankan pada server QA dan database salinan terisolasi; pada server 5152 script hanya mengizinkan GET/HEAD serta POST login.
- Tidak ada perubahan API, migrasi database, dependensi, rilis, commit, atau push GitHub.
