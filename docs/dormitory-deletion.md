# Hapus Data Asrama

Alur pengguna: **Hapus → konfirmasi**. Pengguna tidak perlu memindahkan murid atau
menonaktifkan asrama terlebih dahulu. Hak akses mengikuti pengelola Data Asrama:
izin `manage` dan `penugasan` harus terpenuhi. Server memeriksa sekolah, ID,
versi data, dan konfirmasi.

Penghapusan otomatis mengakhiri penempatan penghuni serta penugasan wali yang
masih terbuka, lalu menandai asrama dengan `deleted_at` dan menonaktifkannya.
Penugasan mendatang ditutup pada tanggal mulainya agar rentang tanggal tetap valid.
Murid tampil di Murid Pasif karena belum memiliki asrama dan dapat ditarik ke
asrama lain; kelas dan status sekolahnya tetap seperti semula.

Asrama hilang dari Data Asrama dan pilihan operasional. Nama dapat dipakai lagi
untuk asrama baru dengan identitas berbeda. Gedung bersama tetap tersedia selama
masih memiliki kamar lain yang belum dihapus. Audit mencatat jumlah penempatan
dan penugasan yang ditutup dalam transaksi yang sama.

Riwayat murid, evaluasi, nilai, dan catatan lama tetap tersimpan. Asrama yang
dihapus tersedia dalam konteks riwayat (`riwayat=1`) dan cetak, dengan pengeditan
dinonaktifkan. Trigger pengunci riwayat tetap berlaku. Asrama yang sudah dihapus
tidak dapat diaktifkan lagi melalui permintaan lama. Tidak ada penghapusan data
murid atau nilai secara berantai.

## Acuan dan verifikasi UI, 5 November 2026

- Acuan terverifikasi dari sumber lokal Rapkumer dan Kaganga:
  `src/routes/(informasi-umum)/kelas/+page.svelte` dan
  `src/lib/components/kelas/delete-kelas-modal.svelte`.
- Kartu Data Asrama tetap memakai susunan semula, padding `p-4`, judul `text-xl`,
  dan deretan tombol `gap-2`. Hapus menggunakan `btn-error btn-soft` dan ikon `del`.
- Dialog mengikuti acuan: maksimum `max-w-2xl`, header/body/footer `p-4`, serta
  konten bergulir dengan batas tinggi 85vh/90vh.
- Pengukuran browser setelah penyederhanaan pada 1280×800: dialog 672×229,6 px;
  pada 390×844: 374,4×313,6 px. Lebar dokumen sama dengan viewport pada kedua ukuran.
- Fokus awal berada di Batal dan kembali ke pemicu Hapus sesudah ditutup.
  Pembatalan melalui Batal dan Escape diperiksa langsung tanpa menghapus data asli.

## Pengujian

`node scripts/test-student-registry.mjs` menggunakan salinan database dan fixture
sintetis untuk memeriksa penghapusan, penutupan penempatan/penugasan otomatis,
penempatan ulang murid, batas role/sekolah, konflik versi, pemakaian ulang nama,
gedung bersama, rollback audit, serta pelestarian riwayat, nilai, catatan, dan
akses cetak. Penghapusan asrama asli tidak dilakukan untuk pengujian.
