---
title: Sinkronisasi Dapodik
---

Gunakan integrasi ini hanya melalui akun yang memiliki izin mengelola data sekolah. URL, token WebService, NPSN, dan semester disimpan terpisah untuk sekolah aktif.

## Data masuk

1. Isi URL WebService, token, dan NPSN lalu jalankan **Tes Koneksi**.
2. Pilih **Buat Pratinjau** dan periksa jumlah data cocok, baru, serta dilewati.
3. Pilih kategori yang diperlukan. Data Murid membutuhkan Data Kelas/Rombel. Ekstrakurikuler membutuhkan Data Kelas/Rombel dan Data Murid.
4. Centang konfirmasi hanya setelah pratinjau diperiksa, lalu pilih **Terapkan Data**.

Penerapan mempertahankan data khusus Kaganga. Ekstrakurikuler ditambahkan tanpa menghapus kegiatan atau relasi murid yang sudah ada. Akun pengguna tidak dibuat otomatis.

## Nilai keluar

1. Pilih **Pratinjau Nilai Keluar**.
2. Periksa kelas, mata pelajaran, binding Dapodik, jumlah nilai siap, dan data yang dilewati.
3. Pilih mata pelajaran, centang konfirmasi, lalu kirim nilai.

Nilai akhir sumatif dikirim pada rentang 0 sampai 100. Deskripsi capaian tujuan pembelajaran dikirim bila tersedia. Pratinjau berlaku satu jam dan otomatis batal bila nilai, deskripsi, atau binding berubah.

## Keamanan

Token tidak ditampilkan kembali di browser, tetapi tersimpan di database lokal. Perlakukan backup Kaganga sebagai data rahasia. Jangan membagikan token atau backup kepada pihak yang tidak berwenang.

Pengujian langsung memerlukan Dapodik Desktop, token WebService, dan persetujuan operator sekolah.
