# Perbaikan Identitas Murid

## Penyebab

Status aktif/arsip sebelumnya memakai NISN sebagai identitas lintas semester.
NISN pengganti seperti `000` membuat banyak murid memakai satu status.
Mengarsipkan satu murid dapat menyembunyikan murid lain yang bernomor sama.

## Perubahan

- Setiap orang memiliki UID internal; baris tiap semester tetap memakai ID masing-masing.
- NISN bukan lagi kunci status aktif/arsip. Nol awal dipertahankan sebagai teks.
- NISN kosong atau placeholder tidak menggabungkan murid dan boleh dikosongkan.
- NISN baru harus 10 digit. Konflik identitas pada tambah/edit/impor ditolak.
- Nilai lama yang tidak valid tidak diubah menjadi nomor perkiraan secara otomatis.
- Pengarsipan satu/massal mempertahankan nilai, presensi, QR, foto, dan riwayat kelas.
- Ekspor tersedia untuk aktif, arsip, atau semua status pada semester aktif.
- Impor konflik dibatalkan dalam transaksi, bukan menimpa anak berdasarkan NISN.
- Pemindahan semester melalui kenaikan kelas/salin semester, bukan mengubah periode baris lama.

## Migrasi dan Pemulihan

1. Ambil backup SQLite terbaru dari **PC server sekolah**, bukan hanya Excel dari client.
2. Simpan backup terpisah sebelum menghentikan aplikasi lama. Jangan jalankan dua versi aplikasi terhadap database yang sama.
3. Uji salinan backup terlebih dahulu. Pembaruan membuat backup konsisten sebelum migrasi UID.
4. Status lama dengan bukti penghapusan milik orang lain serta riwayat aktif yang lengkap dapat dipisahkan otomatis.
5. Data ambigu tetap ditandai **Perlu Periksa Identitas**. Admin memeriksa identitas di Arsip Murid & Alumni sebelum memilih status, mengisi alasan, dan mengonfirmasi pemeriksaan.
6. Snapshot arsip lama tanpa data sumber bersifat baca-saja; mengubah status tidak menciptakan kembali murid yang benar-benar terhapus.
7. Cocokkan jumlah per kelas, nilai, QR, presensi, serta ekspor sebelum membuka akses client kembali.
8. Bila perlu rollback, hentikan aplikasi dan pulihkan seluruh backup sebelum migrasi; jangan memakai versi lama langsung pada database yang sudah dimigrasi.

Audit tanpa menulis, menggunakan Node.js 24:

```powershell
node scripts/audit-murid-identity.mjs --database "C:\path\salinan-backup.sqlite3"
```

`--apply` menjalankan migrasi setelah membuat backup. Gunakan hanya pada salinan yang sudah diperiksa atau database yang memang disetujui untuk pemulihan.

Database PC sekolah belum dianggap pulih hanya karena pengujian salinan lokal lolos.
Pengembangan dan verifikasi lokal memakai port 5152; port produksi 1206 tidak dioperasikan oleh pengujian ini.

## Hasil Pengujian Lokal

- Seluruh 143 pengujian unit lolos, termasuk 189 murid dengan NISN placeholder yang sama.
- `pnpm check`: 0 error, 115 peringatan yang sudah ada; build produksi berhasil.
- QA aplikasi pada salinan database di port 5157: migrasi, pemeriksaan manual, arsip satu/massal, pemulihan, impor konflik dengan rollback, kenaikan kelas, ekspor nol awal, serta batas izin berhasil.
- Halaman input nilai diuji merespons normal; daftar murid API tidak memuat murid yang diarsipkan.
- Tampilan desktop dan mobile diperiksa melalui browser headless pada salinan database.
- Server pengembangan port 5152 aktif dengan HTTP 200; database lokal tetap 92 murid, SQLite `quick_check` OK dan tidak ada pelanggaran foreign key.
- Backup dan pemulihan database PC sekolah masih menunggu file SQLite dari PC server tersebut. Installer v2.2.2 yang sudah dirilis belum memuat patch ini.
