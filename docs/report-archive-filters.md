# Filter Riwayat Rapor

Perubahan terbatas pada pemilihan sumber: Tahun Pelajaran, Semester, Kelas,
Jenis Rapor, dan Tahap Rapor (tengah/akhir semester). Istilah Tahun Pelajaran
menggantikan tahun yang sebelumnya dicampur dalam label Kelas dan periode.
Nama kelas mengikuti tabel kelas yang diizinkan pada sekolah, tahun, dan semester
terpilih. Tidak membuat daftar kelas dari nama murid atau menggabungkan ID kelas.

Acuan UI: halaman Riwayat Rapor Kaganga yang sama sebelum perubahan.
Pengukuran dari sumber, **Fallback Kaganga**: panel p16/radius8, judul20px,
select/tombol40px, tabel minimum680px. Struktur tabel, finalisasi, dan metadata
tidak diubah. Filter beralih dari empat kontrol satu baris menjadi grid enam
kontrol: satu kolom HP, dua kolom tablet, tiga kolom desktop.

Tautan lama `?kelas_id=...` tetap menyimpulkan tahun/semester dari kelas itu.
Parameter baru `tahun_ajaran_id` dan `semester_id` ikut dipertahankan pada
paginasi. Filter eksplisit yang tidak cocok tidak boleh mengambil kelas dari
tahun atau semester lain. Data, penugasan, izin, PDF final dan versi rapor tetap.

Pilihan finalisasi/pratinjau dibersihkan ketika filter diubah, dan tidak tersedia
sampai pilihan tersebut diterapkan, agar rapor kelas sebelumnya tidak tersimpan
dengan konteks filter yang belum diterapkan.

## Rapor Martikulasi

Jenis rapor sekarang memuat sekolah, asrama, dan martikulasi. Martikulasi memakai
izin cetak akademik dan tahap Akhir program; semester mengikuti kelas sumber,
bukan menduplikasi hasil program tahunan ke semester lain. Sumber harus cocok
sekolah, tahun, kelas, murid, dan riwayat. Finalisasi memerlukan delapan aspek
lengkap serta level penempatan, pratinjau dan konfirmasi eksplisit.

PDF menggunakan template martikulasi yang sudah ada. Arsip final dan revisinya
memakai tabel tambahan `rapor_martikulasi_arsip`/`rapor_martikulasi_revisi` agar
CHECK constraint dan PDF final sekolah/asrama tidak perlu dibangun ulang.
Tabel baru bersifat aditif, memiliki FK RESTRICT, unique context, dan trigger
immutable. Berkas tetap di luar SQLite pada folder rapor-arsip dan masuk manifest
backup. Snapshot tidak menerbitkan/mengubah nomor STTM atau nilai sumber.

Ukuran UI tidak berubah: acuan Fallback Kaganga pada pengukuran di atas tetap
dipakai; hanya satu opsi select dan tombol jenis pada halaman detail ditambahkan.
