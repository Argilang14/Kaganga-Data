# Integrasi Dapodik Kaganga

Integrasi ini diadaptasi dari Rapkumer v2.1.3 tanpa melakukan merge terhadap seluruh kode upstream.

## Prinsip keamanan

- Data dipisahkan berdasarkan `sekolah_id` dan semester.
- Tahap pratinjau wajib dilakukan sebelum penerapan data.
- Pencocokan pegawai dibatasi pada sekolah aktif, lalu menggunakan ID PTK, NIP, dan nama.
- Field lokal Kaganga tidak ditimpa jika sudah berisi data.
- Wali asuh, wali asrama, kesehatan, foto, jadwal, Martikulasi, dan dokumen lama tidak diubah.
- Setiap tes, pratinjau, dan penerapan dicatat di `dapodik_sync_log`.

## Matriks tahap 1-10

| Area                  | Status adaptasi | Catatan                                                                          |
| --------------------- | --------------- | -------------------------------------------------------------------------------- |
| Data Sekolah          | Diadaptasi      | Konfigurasi, tes koneksi, pratinjau; profil lokal tidak ditimpa otomatis         |
| Data Pegawai          | Diadaptasi      | ID PTK dan NUPTK; pencocokan wajib per sekolah                                   |
| Data Kelas            | Diadaptasi      | ID rombel dan wali kelas dari pegawai yang telah cocok                           |
| Data Murid            | Diadaptasi      | ID peserta didik/anggota rombel, NIK, anak ke; data khusus Kaganga dipertahankan |
| Tahun ajaran/semester | Diadaptasi      | Dibuat bila belum ada; aktivasi harus dipilih secara eksplisit                   |
| Mata pelajaran        | Diadaptasi      | Referensi dan pembelajaran per rombel; penerapan wajib melalui pratinjau         |
| Nilai                 | Diadaptasi      | Pratinjau terpisah; POST hanya setelah konfirmasi eksplisit                      |
| Manajemen pengguna    | Tidak disalin   | Kaganga memiliki role dan relasi pegawai sendiri                                 |

## Matriks tahap 11-15

| Area                     | Status adaptasi | Catatan                                                                          |
| ------------------------ | --------------- | -------------------------------------------------------------------------------- |
| Referensi mapel nasional | Diadaptasi      | Cache dipisahkan berdasarkan sekolah dan semester                                |
| Pembelajaran rombel      | Diadaptasi      | Dibaca dari data nested rombongan belajar, termasuk sub-mapel                    |
| Pratinjau mapel          | Diadaptasi      | Menampilkan jumlah cocok, baru, dan dilewati sebelum penerapan                   |
| Pemetaan mapel lokal     | Diadaptasi      | Nama, kode, KKM, tujuan pembelajaran, jadwal, dan nilai lokal dipertahankan      |
| Pengampu                 | Diadaptasi      | Hanya diisi dari PTK yang sudah cocok dan hanya jika pengampu lokal masih kosong |
| Kirim nilai              | Diadaptasi      | Mata evaluasi dan nilai memakai ID stabil serta jurnal pengiriman lokal          |

## Tahap 16-24: pengiriman nilai

- Sumber pengiriman adalah `nilai_akhir` asesmen sumatif per murid dan mata pelajaran.
- Pratinjau nilai dipisahkan dari sinkronisasi data masuk dan hanya berlaku satu jam.
- Perubahan nilai atau binding Dapodik membatalkan pratinjau secara otomatis.
- Kelas, mapel, dan murid tanpa ID Dapodik lengkap selalu dilewati dan diberi alasan.
- Nilai yang diterima hanya angka 0 sampai 100, dibulatkan dua desimal.
- Mata evaluasi dan nilai memakai UUID deterministik agar pengiriman ulang memakai identitas yang sama.
- Hasil tiap nilai disimpan di `dapodik_nilai_kirim`; token tidak ditulis ke ringkasan log.
- Pengujian lokal tidak melakukan POST nyata. Pengujian langsung memerlukan Dapodik desktop dan token sekolah.

## Tahap 25-32: penyempurnaan integrasi

- Rombel ekstrakurikuler Dapodik (`jenis_rombel=51`) tersedia dalam pratinjau terpisah.
- Penerapan ekstrakurikuler bersifat aditif dan idempoten: kegiatan serta relasi murid yang belum ada ditambahkan, sedangkan data lokal tidak dihapus.
- Ekstrakurikuler hanya dapat diterapkan bersama kategori kelas dan murid agar relasinya tidak menggantung.
- Deskripsi capaian dibentuk dari nilai tujuan pembelajaran dan dikirim sebagai `ket_kognitif` maksimal 300 karakter bila tersedia.
- Perubahan deskripsi turut mengubah fingerprint sehingga pratinjau nilai lama otomatis dibatalkan.
- Akun pengguna Dapodik tidak dibuat otomatis karena Kaganga memiliki role, relasi pegawai, dan kebijakan penghapusan akun tersendiri.
- Pengiriman nilai tetap membutuhkan konfirmasi operator dan jurnal pengiriman lokal.
- Pengujian POST nyata tetap memerlukan Dapodik desktop, token WebService, dan otorisasi sekolah.

## Tahap 33-36: finalisasi operasional

- Halaman sinkronisasi hanya dapat diakses oleh pengguna dengan izin `sekolah_manage`.
- Token tidak dikirim kembali ke browser; tampilan hanya menunjukkan apakah token sudah tersimpan.
- Token tersimpan di database lokal per sekolah sehingga backup Kaganga harus diperlakukan sebagai data rahasia.
- Panduan operator menjelaskan urutan tes koneksi, pratinjau, konfirmasi, penerapan data, dan pengiriman nilai.
- Tidak ada akun pengguna yang dibuat dari Dapodik dan tidak ada data lokal yang dihapus melalui sinkronisasi.
- Verifikasi lokal dilakukan tanpa POST nyata ke Dapodik dan tanpa mengoperasikan port 1206.
