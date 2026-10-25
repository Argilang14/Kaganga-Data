# Audit UI Kokurikuler dan Data Mata Pelajaran

Tanggal: 25 Oktober 2026.

## Ruang Lingkup

- Acuan yang diminta: `http://localhost:5152/kokurikuler`.
- Sasaran perapihan berikutnya: `http://localhost:5152/data-mata-pelajaran`.
- Audit ini tidak mengubah komponen aplikasi, fungsi, izin, skema, atau data mapel.
- Pengukuran memakai Chrome headless melalui Puppeteer pada server lokal yang sedang berjalan. Listener port 5152 terverifikasi. Animasi dinonaktifkan hanya dalam halaman browser audit agar ukuran akhir tidak tercampur transformasi animasi.
- Semua ukuran dalam CSS pixel, bukan ukuran fisik cetak. Status bukti: **Fallback Kaganga, diukur langsung pada aplikasi lokal**. Ini bukan klaim ukuran persis Rapkumer upstream terbaru.
- Ukuran layar: 1440x1000, 1280x1000, 768x1000, 390x844, dan 320x844.

## Temuan Utama

1. **P2, dropdown Excel terpotong pada HP kecil.** `src/routes/(informasi-umum)/data-mata-pelajaran/+page.svelte:119`: kombinasi dropdown rata kanan dan tombol yang turun ke baris sendiri membuat menu 240 px bergeser hingga x = -108,66 px pada layar 320 px. Sebagian label tidak terlihat. Pada 390 px menu masih berada di dalam layar. Perlu penempatan rata kiri pada layar kecil, tanpa mengubah tujuan template, impor, dan ekspor.
2. **P2, pesan tabel kosong sulit terlihat pada HP.** `src/routes/(informasi-umum)/data-mata-pelajaran/+page.svelte:299`: pesan dipusatkan pada sel selebar sekitar 624 px saat hasil pencarian kosong di layar 320 px. Titik tengah teks berada di luar viewport. Pesan kosong sebaiknya ditempatkan pada area selebar pembungkus tabel, bukan mengikuti lebar seluruh tabel.
3. **P2, popup acuan memiliki kekurangan fokus keyboard.** `src/lib/components/kokurikuler/form-modal.svelte:54`: popup memakai pembungkus berperan dialog serta elemen `dialog open`, bukan `showModal()`. Fokus tetap di tombol pembuka; Escape langsung setelah membuka tidak menutup popup. Escape baru bekerja setelah input di dalam popup mendapat fokus. Pola ini jangan disalin ke Data Mata Pelajaran yang sudah memakai dialog modal native.
4. **P2, footer impor acuan terpotong pada 320 px.** `src/routes/(mata-pelajaran)/kokurikuler/+page.svelte:233`: tiga tombol membutuhkan sekitar 306 px termasuk jarak, sedangkan ruang isi footer hanya 272 px. Tombol Batal mulai pada x = -9,56 px dan terpotong. Perapihan target harus memakai susunan tombol yang dapat membungkus atau bertumpuk, bukan menyalin masalah ini.
5. **P3, ukuran dan struktur belum seragam.** Judul target 24 px dibanding acuan 20 px; tombol aksi target 24x24 px dibanding 38x32 px; checkbox target 20x20 px dibanding 24x24 px. Ini perbedaan konsistensi dan kenyamanan interaksi, bukan bukti fungsi gagal.
6. **P3, label dan nama dialog perlu dilengkapi.** Kedua halaman belum menghubungkan judul popup melalui `aria-labelledby`. Input Kode dan Kegiatan pada popup Kokurikuler memiliki teks pendamping berbentuk `p`, bukan label yang terhubung. Input unggah Excel target belum memiliki label terhubung atau `aria-label`. Tombol aksi target memiliki `title`, tetapi sebaiknya diberi `aria-label` eksplisit.

## Ukuran Dasar Desktop

Pengukuran pada 1440x1000; tinggi baris isi mengikuti data yang tampil, bukan tinggi baku.

| Komponen | Kokurikuler | Data Mata Pelajaran |
| --- | --- | --- |
| Sidebar terbuka | Lebar 280 | Lebar 280 |
| Navbar | Tinggi 64 | Tinggi 64 |
| Area konten | Lebar 1103 | Lebar 1103 |
| Struktur halaman | Satu panel berpadding 16 | Judul terpisah, blok filter, blok tabel |
| Radius panel/popup | 8 | 8 |
| Ukuran judul halaman | 20 | 24 |
| Tombol utama | Tinggi 40, teks 14 | Tinggi 40, teks 14 |
| Dropdown Excel | 192x109, padding 4, radius 6 | 240x117, padding 8, radius 8 |
| Lebar tabel | 1071 | 1101 |
| Kolom tabel | 6 | 9 |
| Tinggi kepala tabel | 49,5 | 47,5 |
| Font tabel desktop | 14 | 14 |
| Padding sel vertikal/horizontal | 12 / 16 | 12 / 16 |
| Baris isi pertama yang terukur | 87 | 62 |
| Checkbox tabel | 24x24 | 20x20 |
| Tombol aksi per baris | 38x32 | 24x24 |
| Pencarian dan filter | Tidak tersedia | Pencarian, jenjang, kategori; kontrol tinggi 40 |
| Jarak antarkolom filter desktop | Tidak berlaku | 12 |
| Konfirmasi hapus | Popup aplikasi | Konfirmasi native browser |

Pada desktop 1440 px, tombol Jadwal Pelajaran target sudah turun ke baris kedua karena ruang judul dan kelompok tindakan. Ini tidak menumpuk elemen, tetapi membuat kepala halaman lebih tinggi daripada acuan.

### Lebar Kolom Desktop

Urutan Kokurikuler: checkbox 56; No 51,63; Kode 80; 8 DPL 200; Kegiatan 561,38; Aksi 120.

Urutan Data Mata Pelajaran: checkbox 52; Kode 93,84; Nama 226,55; Jenjang/Fase 157,77; Kategori 136,42; JP/Minggu 104,70; Guru 161,16; Status 84,52; Aksi 84,05.

Angka tersebut adalah hasil layout dengan data lokal, bukan lebar kolom yang semuanya dikunci dalam kode. Acuan memiliki `min-w-[720px]`, tetapi lebar minimum nyata masih sekitar 754-770 px karena kebutuhan kolom. Target tidak memiliki pembagian kolom/minimum eksplisit; lebarnya bergantung pada isi.

## Ukuran Popup

| Popup | Lebar desktop | Tinggi desktop yang terukur | Padding desktop | Lebar 390 / 320 | Padding HP |
| --- | --- | --- | --- | --- | --- |
| Tambah/edit Kokurikuler | 672 | 580 | 24 | 374 / 304 | 16 |
| Hapus tunggal/massal Kokurikuler | 448 | 192 | 24 | Belum diukur | Belum diukur |
| Impor Kokurikuler, tanpa pratinjau berkas | 768 | 224 | 24 | 374 / 304 | 16 |
| Tambah/edit Data Mata Pelajaran | 896 | 792 | 24 | 374 / 304 | 16 |
| Impor Data Mata Pelajaran | 512 | 296 | 24 | 374 / 304 | 16 |

- Semua judul popup terukur 18 px; tombol footer tinggi 40 px; jarak antartombol 8 px.
- Input Kode acuan desktop berukuran 624x40; textarea Kegiatan 624x112.
- Input setengah kolom target desktop berukuran 416x40; pemilih warna 416x48; textarea Catatan selebar 848 dengan tinggi 96.
- Pada layar 768 px, popup tambah/edit acuan tetap 672 px; popup target menyesuaikan menjadi 704 px. Keduanya memakai padding 24 px.
- Popup target pada HP memiliki tinggi terlihat 828 px. Tinggi isi 1040 px pada layar 390 dan 1060 px pada layar 320, sehingga memang perlu gulir vertikal. Footer sudah sticky dari CSS global; jangan menghapus perilaku ini saat dirapikan.
- Form target lebih panjang karena memuat kode, jenjang, fase, kategori, nama, JP, guru, warna, status, dan catatan. Lebar 672 px dari acuan perlu diuji dengan seluruh bidang tersebut, bukan diterapkan begitu saja.
- Urutan tindakan acuan Batal lalu Simpan; target Simpan lalu Batal. Perapihan dapat menyelaraskan urutan tanpa mengubah handler submit.
- Konfirmasi hapus target bukan elemen DOM aplikasi. Ukuran dialog browser tidak diklaim sama dengan popup 448 px acuan.

## Perilaku Responsif

| Lebar layar | Konten | Tabel / area gulir Kokurikuler | Tabel / area gulir Data Mata Pelajaran | Popup tambah acuan / target |
| --- | --- | --- | --- | --- |
| 1440 | 1103 | 1071 / 1071 | 1101 / 1101 | 672 / 896 |
| 1280 | 943 | 911 / 911 | 941 / 941 | 672 / 896 |
| 768 | 719 | 769,63 / 687 | 871,58 / 717 | 672 / 704 |
| 390 | 351 | 753,63 / 319 | 788,58 / 349 | 374 / 374 |
| 320 | 281 | 753,63 / 249 | 788,58 / 279 | 304 / 304 |

- Tidak terukur pelebaran halaman utama melebihi viewport pada kelima ukuran. Gulir horizontal berada di pembungkus tabel. Ini tidak berarti seluruh komponen aman: dropdown target dan footer impor acuan tetap dapat terpotong.
- Sidebar berada di luar layar saat tertutup pada HP; navbar turun menjadi 56 px. Lebar sidebar drawer 280 px pada layar 390, dibatasi menjadi 272 px pada layar 320.
- Font tabel HP 13 px; padding sel 10,4 px vertikal dan 12 px horizontal, mengikuti CSS global.
- Filter target baru menjadi empat kolom pada breakpoint `lg` (1024 px). Pada 768 px semuanya masih satu kolom. Ada kesempatan memakai dua kolom tablet agar tidak memanjang berlebihan.
- Grid dimensi acuan menjadi dua kolom pada 640 px; form target dua kolom pada 768 px. Bidang penuh tetap harus dipertahankan sesuai isinya.
- Label filter target terukur `display: block`. Kelas `gap-1` bukan pengatur jarak antaranak dalam layout block; jarak visual tepi teks ke kontrol sekitar 2 px. Perlu susunan label/grid/flex yang eksplisit saat merapikan jarak.

## Batas Fungsi yang Harus Dipertahankan

- Kokurikuler memuat data berdasarkan kelas aktif: `src/routes/(mata-pelajaran)/kokurikuler/+page.server.ts:53`.
- Data Mata Pelajaran adalah master lingkup sekolah dengan filter pencarian, jenjang, dan kategori: `src/routes/(informasi-umum)/data-mata-pelajaran/+page.server.ts:173`. Jangan menambahkan pembatas kelas aktif hanya untuk menyeragamkan tampilannya.
- Pertahankan sembilan kolom target beserta JP, guru, status, warna, dan jumlah slot penggunaan. Jangan memaksa tabel master memakai enam kolom acuan.
- Pertahankan action `?/save`, `?/delete`, `?/deleteBulk`, `?/importExcel`, endpoint template/ekspor, ID data, serta validasi/otorisasi yang ada.
- Impor target dapat memperbarui data dengan kode yang sama. Perapihan tidak boleh diam-diam mengganti aturan ini atau menjalankan impor untuk uji tampilan.

## Usulan Urutan Perapihan Berikutnya

1. Samakan skala judul 20 px, padding panel 16 px, radius 8 px, dan kelompok tindakan dengan karakter Kokurikuler. Tautan Jadwal Pelajaran tetap tersedia.
2. Rapikan filter: label terhubung di atas kontrol, jarak eksplisit, tinggi kontrol 40 px, serta susunan satu kolom HP, dua kolom tablet, dan baris desktop.
3. Tetapkan pembagian kolom tabel master yang sesuai sembilan kolom. Samakan checkbox 24 px dan tombol aksi tinggi 32 px; pertahankan gulir horizontal lokal serta pesan kosong yang terlihat tanpa menggeser tabel.
4. Rapikan tambah/edit dengan lebar ringkas yang diuji terhadap bidang lengkap, kelompok isian, footer Batal lalu Simpan, nama dialog, fokus, Escape, dan gulir HP. Pertahankan modal native target.
5. Selaraskan menu Excel dan popup impor. Pastikan dropdown tidak keluar layar 320 px, input berkas memiliki label, serta tombol tidak terpotong.
6. Bandingkan screenshot sebelum/sesudah pada ukuran yang sama dan uji ulang alur simpan/impor/hapus di database salinan terisolasi setelah implementasi diizinkan.

Tahapan ini belum diterapkan pada aplikasi.

## Bukti dan Batas Pengujian

- Pengukuran utama: `tmp/ui-kokurikuler-mapel-audit-2026-10-25/measurements.json`, 49 catatan kondisi termasuk pengujian Escape.
- Tambahan: `tmp/ui-kokurikuler-mapel-audit-2026-10-25/extra.json`, mencakup shell, dropdown, konfirmasi hapus yang dibatalkan, Tab, dan hasil kosong.
- Screenshot pada folder yang sama: halaman, tambah, impor untuk kedua menu pada lima ukuran; dropdown target pada 1440/390/320; hasil kosong target pada 320. Isi baris dan pilihan guru disamarkan pada screenshot utama.
- Contoh temuan visual: `data-mata-pelajaran-dropdown-320.png` dan `kokurikuler-import-320.png`.
- Browser berhasil memuat kedua halaman; tidak ada error JavaScript pada pengukuran utama. Konfirmasi hapus target dibuka dan langsung dibatalkan. Popup hapus acuan hanya dibuka lalu dibatalkan.
- Permintaan tulis diblokir oleh script kecuali POST login. Tidak ada permintaan mutasi bisnis yang dicoba dalam log audit. Akses baca normal tetap membuat sesi login dan konteks kelas sebagaimana aplikasi bekerja.
- Popup tambah/edit, impor awal, dropdown, seleksi acuan, dan Escape diukur. Tab pada target diuji tanpa mengaktifkan submit; pada satu putaran fokus sempat menuju BODY/browser, bukan kontrol halaman di belakang dialog.
- Simpan, impor berkas, pratinjau Excel, penghapusan, status memuat/error server, mode gelap, dan data sangat panjang belum diuji sebagai alur bisnis. Tidak ada klaim audit izin atau integritas database penuh.
- Build/lint/test aplikasi tidak dijalankan karena tidak ada perubahan kode aplikasi. Server 5152 tidak perlu dimuat ulang untuk audit ini.
- Pedoman aksesibilitas pelengkap: [Web Interface Guidelines](https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md). Acuan ukuran tetap hasil ukur menu lokal, bukan angka dari pedoman tersebut.
