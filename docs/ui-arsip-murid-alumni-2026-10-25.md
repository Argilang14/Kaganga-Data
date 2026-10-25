# Perapihan UI Arsip Murid & Alumni

Tanggal: 25 Oktober 2026.

## Cakupan dan acuan

Permintaan pengguna adalah menerapkan perapihan Data Pegawai pada Arsip Murid & Alumni, dengan Data Murid sebagai acuan. Tidak ada permintaan perubahan database, izin, alur arsip, atau rilis.

Acuan dimensi adalah **Fallback Kaganga, diukur langsung dari halaman Murid dan Pegawai lokal**, bukan klaim ukuran persis Rapkumer upstream. Detail pengukuran acuan terdapat dalam `docs/ui-data-murid-pegawai-audit-2026-10-25.md`. Sumber yang dipakai: `src/routes/(informasi-umum)/murid/+page.svelte`, `src/routes/(informasi-umum)/pegawai/+page.svelte`, dan token bersama di `src/app.css`.

| Komponen | Acuan lokal | Arsip sebelum | Implementasi |
|---|---|---|---|
| Judul dan permukaan halaman | Judul 20 px, padding 16 px, radius 8 px | Sudah sesuai | Dipertahankan |
| Filter | Input/tombol utama 40 px, label terpisah | Panel tambahan berpading 16 px; status 220 px | Tanpa panel bertingkat; status 180 px; ada reset filter |
| Tabel desktop | Header 49,5 px; isi mengikuti kebutuhan | Baris sampel 78 px | Padding vertikal 10 px; tinggi tetap mengikuti isi |
| Lebar tabel | Sesuai banyaknya kolom | Minimum 980 px; bertambah ketika riwayat dibuka | Minimum 1040 px dengan sembilan kolom tetap, teks membungkus |
| Popup | Lebar standar maksimum 672 px, padding 16 px | Riwayat dan pemeriksaan identitas berada dalam sel tabel | Dialog native terpisah secara visual tanpa menambah lebar baris |
| Tombol aksi | Ikon 32 px dengan nama aksesibel | Teks aksi panjang dalam sel | Ikon, tooltip, dan jumlah riwayat dipertahankan |
| Pagination | Tetap berada dalam lebar halaman | Semua nomor halaman dalam satu join | Awal/akhir, sekitar halaman aktif, dan panah; dapat membungkus |

Minimum 1040 px dipilih untuk sembilan kolom arsip, bukan dipaksakan mengikuti tabel Murid yang memiliki kolom berbeda. Pada HP dan tablet, gulir horizontal hanya berada di wadah tabel. Popup memakai batas tinggi 85dvh dan dapat digulir.

## Perubahan

- Pencarian, filter status, dan tombol reset disejajarkan. Mode pemeriksaan identitas diberi penanda ketika filter tersebut aktif.
- Panel tindakan muncul setelah memilih murid, dengan warna info ringan dan kontrol status/penempatan yang tetap sama.
- Kolom nama, nomor identitas, kelas, status, tanggal/alasan, riwayat, dan aksi tetap tersedia. Label header membungkus untuk mencegah tumpang tindih.
- Riwayat kelas dan pemeriksaan identitas dibuka melalui dialog native. Kesalahan pemeriksaan ditampilkan di dalam popup juga.
- Popup hapus permanen memakai padding, judul, dan footer yang konsisten. Pemeriksaan dampak, konfirmasi nama, alasan, persetujuan, penghalang penghapusan, dan kewajiban backup tetap dipertahankan.

Berkas aplikasi yang diubah: `src/routes/(informasi-umum)/murid/arsip/+page.svelte` dan `src/lib/components/murid/purge-murid-modal.svelte`. Skrip `scripts/test-murid-identity-copy.mjs` diperbarui untuk membuka popup pemeriksaan melalui tombol baru serta menguji lebar tabel, modal native, dan pengembalian fokus.

## Bukti dan pengujian

Pengukuran awal pada 1440x1000: tabel mulai di y 277 px, lebarnya 1071 px, dan baris sampel 78 px. Membuka riwayat memperlebar tabel menjadi sekitar 1146 px dan mempertinggi baris pertama menjadi sekitar 108 px. Pada HP 390x844, tabel mulai di y 437 px dengan wadah 319 px.

Putaran implementasi pertama menunjukkan tabel mulai di y 241 px pada desktop dan y 405 px pada HP. Riwayat ditampilkan dalam popup tanpa mengubah lebar tabel. Screenshot kemudian digunakan untuk memperbaiki jarak judul kolom dan mempertahankan tinggi keadaan kosong; bukti final disimpan terpisah dari putaran awal.

- Pemeriksaan Svelte: 0 error, 116 peringatan di luar dua komponen ini. Kedua komponen juga dikompilasi terpisah tanpa peringatan.
- ESLint terfokus: lulus.
- Sebelas tes lifecycle dan migrasi identitas murid: lulus.
- Kontrak formulir dibandingkan melalui AST Svelte: 26 atribut nama/aksi pada halaman dan 8 pada komponen hapus permanen tetap sama.
- Pengujian integrasi memakai salinan database dan direktori data terpisah, pada port 5157, bukan database server 5152. Meliputi pemeriksaan identitas, pemulihan, arsip, penempatan, validasi NISN, izin admin, perlindungan dokumen, backup sebelum hapus permanen, dan integritas SQLite.

Pengukuran awal: `tmp/ui-arsip-before-2026-10-25/`. Putaran awal implementasi: `tmp/ui-arsip-after-2026-10-25/`. Skrip audit visual hanya mengizinkan GET/HEAD serta POST login; tidak mengirim perubahan data pada server utama. Screenshot lokal dapat memuat identitas dan tidak dimaksudkan untuk dipublikasikan.

Server menggunakan build lokal pada port 5152, melanjutkan mode runtime yang dipakai saat perapihan Data Pegawai. Tidak ada perubahan dependensi, CSS bersama, versi aplikasi, installer, commit, push, atau rilis dalam tugas ini.

### Pemeriksaan akhir

- Build produksi terakhir selesai, termasuk adapter Node. Server dimuat ulang dari build tersebut; `/login` merespons HTTP 200 dan listener port 5152 terverifikasi.
- Screenshot desktop terakhir: judul kolom tidak bertumpuk, `No` tetap satu baris, header 49,5 px, baris sampel 74 px, dan awal tabel di y 241 px. Pada HP 390 px, tabel berada dalam wadah 319 px dan mulai di y 405 px.
- Bukti visual akhir: `tmp/ui-arsip-final-2026-10-25/`; mencakup desktop 1440/1280 px, tablet 768 px, HP 390/320 px, pilihan murid, riwayat, filter kosong, serta mode gelap desktop/HP. Audit memeriksa overflow halaman, batas judul kolom, lebar tabel saat popup terbuka, modal native, Escape, dan pengembalian fokus.
- Pengujian integrasi ulang lulus dengan tambahan pemeriksaan popup pada empat ukuran layar. Bukti sintetis: `tmp/murid-identity-qa-gUJHBl/`; ringkasan: `tmp/ui-arsip-copy-final-test.log`. Pengujian ini tidak menyimpan perubahan pada database utama.
- Kontrak formulir diperiksa ulang: 26 pada halaman arsip dan 8 pada popup hapus permanen tidak berubah. `git diff --check` untuk tiga berkas implementasi/pengujian lulus.

### Koreksi checkbox

Pengukuran langsung (Fallback Kaganga, bukan ukuran Rapkumer upstream): checkbox Data Murid berukuran 24 x 24 px dengan radius 8 px. Pada Arsip, kolom seleksi 48 px dikurangi padding sel 16 px di kedua sisi menyisakan 16 px, sehingga checkbox desktop/tablet tertekan menjadi 16 x 24 px. Pada HP, padding sel 12 px membuatnya tetap 24 x 24 px. Kolom seleksi diubah menjadi 56 px memakai token `w-14`; kelas checkbox, radius, status nonaktif, label aksesibel, dan handler pemilihan tidak diubah. Bukti pengukuran dan screenshot: `tmp/ui-arsip-checkbox-2026-10-25/`.
