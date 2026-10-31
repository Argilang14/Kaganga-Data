# Impor pegawai dari Setara

Menu: Informasi Umum > Data Pegawai > tombol panah di samping Tambah Pegawai > Import Data Pegawai.

## Format

- Template XLSX Kaganga tetap didukung, termasuk template lama.
- Ekspor CSV Guru dan Tendik Setara dibaca langsung, UTF-8, pemisah titik koma atau koma. Batas 5 MB dan 2.000 baris per file.
- Nomor identitas diproses sebagai teks. NIP Setara harus 18 digit jika terisi; NIK 16 digit wajib untuk pencocokan.
- Nilai kosong, `-`, `0`, dan `Belum ditentukan` dianggap belum diisi, bukan data identitas.

## Alur

1. Pilih CSV Guru atau Tendik, lalu Periksa Data.
2. Tinjau jumlah baru, diperbarui, bermasalah, dan peringatan tanggal.
3. Konflik identitas membatalkan impor secara bawaan. Bila sudah disetujui operator, centang Impor hanya baris valid untuk melewati baris bermasalah. Baris tersebut tidak diubah atau dihapus.
4. Simpan Import. Impor ulang mencocokkan ID pegawai yang sama melalui NIP/NIK, bukan membuat duplikat.

Nama yang sama tanpa identitas cocok tidak digabung otomatis. NIP/NIK yang menunjuk dua pegawai berbeda harus diperiksa manual. Tidak ada pencocokan nama samar.

## Pemetaan dan perlindungan

- Guru menjadi jenis guru; Jenis SDM dipetakan ke wali_asuh, wali_asrama, keamanan, tim_dapur, tu, operator, kebersihan, atau lainnya untuk Bendahara. Jabatan asli tetap disimpan.
- Biodata, alamat, kontak, status kepegawaian, nomor/tanggal SK, TMT, dan sekolah utama masuk ke kolom pegawai yang sesuai. Sekolah utama menjadi Unit Penempatan, bukan sekolah/database baru.
- NRG, mapel, Jenis SDM, RT/RW masuk Catatan dengan penanda Setara. Catatan lama dipertahankan; baris catatan identik tidak digandakan.
- Pada pegawai lama, nama, jenis, jabatan yang sudah terisi dan status aktif/nonaktif tetap. Kolom kosong dari CSV tidak menghapus isian lokal.
- Tanggal SK/TMT tahun 1990/1900 diberi peringatan dan tetap disimpan sesuai sumber. Operator perlu memverifikasi tanggal tersebut.
- Akun, password, izin, foto, dokumen, kelas, jadwal, dan penugasan tidak dibuat ulang atau diubah oleh impor ini.
- Seluruh penulisan satu file dan riwayat impornya berada dalam transaksi. Identitas diperiksa ulang di dalam transaksi sebelum menyimpan. Akses tetap mengikuti izin sekolah_manage dan sekolah aktif.

## Acuan UI

Perubahan terbatas pada popup impor yang sudah ada; tidak merombak halaman pegawai. Acuan dimensi adalah **Fallback Kaganga**, bukan pengukuran Rapkumer terbaru: `src/routes/(informasi-umum)/pegawai/+page.svelte` memakai modal `max-w-2xl` sebelum pratinjau, `max-w-4xl` setelah pratinjau, padding 16px, serta tabel minimal 720px dengan scroll lokal maksimal 288px. Input, tombol, checkbox dan alert memakai DaisyUI yang sudah terpasang. Label format, peringatan, dan pilihan melewati konflik ditambahkan di dalam susunan tersebut.

## Pengujian

- `node --test src/lib/server/pegawai-excel.test.ts src/lib/server/pegawai-setara.test.ts`
- `node scripts/test-pegawai-setara-copy.mjs [path-guru.csv] [path-tendik.csv]`

QA kedua hanya bekerja pada database salinan di folder tmp dan port 5190; tidak mengimpor ke database operasional. Screenshot, laporan konflik, backup, dan CSV pribadi tidak boleh dikomit atau disertakan pada rilis.

Validasi 30 Oktober 2026: 347 tes unit lulus; build produksi berhasil; pemeriksaan Svelte 0 error dengan 116 warning lama. QA HTTP pada salinan menguji kedua CSV, impor ulang tanpa duplikasi, penolakan konflik secara bawaan, pilihan melewati konflik, rollback kegagalan riwayat, batas sekolah/izin, serta popup 390/768/1440px. Lint berkas tersentuh masih memiliki 8 temuan lama (`any` dan dua variabel legacy); modul CSV dan tes baru tidak menambah temuan tersebut.
