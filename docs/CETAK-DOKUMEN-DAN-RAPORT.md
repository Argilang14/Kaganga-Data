# Cetak Dokumen dan Cetak Raport

- Cetak Dokumen (`/cetak`): kartu absensi, jadwal pelajaran, kalender pendidikan, jurnal mengajar, dan PDF Buku Tamu Digital dalam dropdown yang sama. Buku Tamu tetap menggunakan izin Buku Tamu; link lama `/cetak/buku-tamu` dialihkan ke pilihan tersebut dengan filter tetap terbawa.
- Cetak Raport (`/cetak-raport`): memakai format SR untuk varian SRD/SRMP/SRMA atau jenjang SRT. SD/SMP/SMA/SLB/PKBM non-SR mempertahankan format bawaan.
- Jenis sekolah ditentukan dari `jenjangPendidikan` dan `jenjangVariant`, bukan nama sekolah. Jenis yang tidak dikenal harus diperiksa admin; tidak ada perubahan database otomatis.
- Link lama `/cetak-sr` dialihkan ke Cetak Raport. Link dengan `dokumen` umum dialihkan ke Cetak Dokumen.
- Tombol PDF pada Buku Tamu meneruskan tanggal dan pencarian ke halaman cetak. Excel tetap berada pada Buku Tamu.
- Generator PDF, identitas sekolah, foto/QR, tanda tangan, dan pembatasan akses kelas tetap menggunakan implementasi yang ada.
- Gunakan tombol Unduh PDF pada preview untuk menyimpan dengan nama terstruktur. Nama file mengikuti jenis dokumen, murid/kelas atau jenjang, tahun ajaran/periode. Ini juga berlaku untuk PDF massal. Tombol simpan bawaan browser pada URL blob dapat mengabaikan nama respons, sehingga tombol Unduh PDF disediakan di luar viewer.

## Pengujian

`node --test src/lib/school-print-format.test.ts src/lib/menu-access.test.ts src/lib/export-access.test.ts`

`corepack pnpm check`

`corepack pnpm build`

`node scripts/test-print-navigation-copy.mjs`

Tes integrasi membuat salinan SQLite konsisten di folder sementara dan menggunakan port QA 5153. Tidak menggunakan database produksi atau port 1206. Pengaktifan hasil perubahan pada lingkungan pengembangan menggunakan port 5152.
