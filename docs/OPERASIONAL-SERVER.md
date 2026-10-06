# Operasional Server Kaganga

## Prinsip utama

- Gunakan satu server produksi sebagai sumber data utama.
- Client mengakses alamat LAN atau Cloudflare menuju server yang sama.
- Jangan menyalakan dua server dari salinan database produksi yang sama.
- SQLite menyimpan data terstruktur. Foto dan lampiran berada di folder data di luar SQLite.

## Backup bertingkat

Admin dapat membuat backup harian, mingguan, manual, atau sebelum pembaruan melalui **Pengaturan > Operasional Sistem**.

- Harian: lakukan setiap hari kerja.
- Mingguan: simpan salinan pada media lain setiap akhir minggu.
- Sebelum pembaruan: wajib sebelum memasang versi baru.
- Folder `uploads` harus disalin bersama backup SQLite karena lampiran tidak disimpan di database.

Pemeriksaan backup belum lengkap jika hanya melihat nama file. Lakukan uji pemulihan berkala pada salinan database dengan `pnpm test:database-safety` dan alur impor pada lingkungan uji.

## Pemindahan server

1. Buat backup **Sebelum pembaruan** dan salin folder lampiran.
2. Hentikan Kaganga pada server lama.
3. Pasang Kaganga pada perangkat baru.
4. Impor backup SQLite dan salin folder lampiran ke lokasi data yang dipilih.
5. Buka **Operasional Sistem** dan pastikan `quick_check` bernilai `ok`, foreign key bernilai `0`, serta tidak ada lampiran hilang.
6. Alihkan alamat LAN/Cloudflare ke perangkat baru.
7. Jangan menyalakan kembali server lama kecuali database produksinya sudah dipisahkan dan ditandai sebagai arsip.

## Pemeriksaan sebelum rilis

Jalankan pada salinan database, bukan database produksi aktif:

```powershell
pnpm db:audit
pnpm test:database-safety
pnpm check
pnpm build
```

Catat hasil uji pemulihan dan uji pembaruan dari versi produksi sebelumnya sebelum installer dipublikasikan.
