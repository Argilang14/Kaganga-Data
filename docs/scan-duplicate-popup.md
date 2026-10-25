# Popup scan ganda

## Cakupan

Murid yang dipindai ulang pada tanggal dan kegiatan yang sama mendapat popup dari hasil pemeriksaan server (`already_present`). Nama petugas, waktu, dan status adalah milik pencatatan pertama, bukan milik perangkat yang memindai ulang. Tidak mengubah API, database, hak akses, atau aturan koreksi.

Pemeriksaan server dan penyimpanan idempoten sudah ada sebelum perubahan ini pada `src/routes/api/administrasi/absensi/scan/+server.ts` dan `src/lib/server/attendance-mutation.ts`. Sebelumnya halaman scan hanya menampilkan alert serta riwayat berwarna merah.

## Acuan UI

Referensi lokal berkarakter Rapkumer: `src/lib/components/global-modal.svelte` dan token `src/app.css`. Ini **Fallback Kaganga terverifikasi dari sumber lokal**, bukan pengukuran upstream Rapkumer terbaru.

| Bagian          | Ukuran/pola lokal yang dipakai                                                |
| --------------- | ----------------------------------------------------------------------------- |
| Dialog          | Native dialog dan global-modal yang sudah dipakai aplikasi                    |
| Lebar maksimum  | Token app-modal 42rem, dibatasi lebar viewport dikurangi 16px                 |
| Tinggi maksimum | Min(85dvh, tinggi viewport dikurangi 16px); body bergulir                     |
| Judul           | 18px, bobot 700                                                               |
| Padding/radius  | Token app-modal-padding dan app-radius, mengikuti tema dan breakpoint bersama |
| Tombol          | Minimal 40px, label Lanjutkan Scan, ikon play yang tersedia                   |
| Informasi       | Nama/kelas, kegiatan, status, petugas pertama, tanggal/jam WIB                |
| Warna           | Alert-error soft, mengikuti tema terang/gelap                                 |

Popup memakai teks komponen Svelte, bukan interpolasi HTML. Judul menjadi Sudah Tercatat jika data sebelumnya berasal dari input manual; waktu kosong tidak direka sebagai waktu scan baru. Penutupan melalui tombol, Escape, dan backdrop menggunakan siklus modal bersama. Kamera tidak menerima token baru selama popup terbuka; menutup popup melanjutkan penerimaan tanpa meminta izin kamera lagi. Untrack menjaga penutupan modal tidak memicu pembukaan ulang dari hasil scan yang sama.

Offline tetap memakai antrean yang ada. Scan lintas perangkat hanya dapat dibandingkan setelah perangkat terhubung ke server; duplikat yang ditemukan ketika sinkronisasi juga menampilkan popup. Scan untuk kegiatan lain tetap diperbolehkan.

## Verifikasi

Skrip `scripts/test-scan-duplicate-popup-copy.mjs` hanya menjalankan mutasi pada database salinan. Lima kelompok pemeriksaan lulus: akun Guru A/B dan delapan scan bersamaan (satu catatan), kamera QR simulasi dan jeda request selama popup, penutupan popup serta status sakit manual, kegiatan berbeda, dan sinkronisasi antrean offline. Baris absensi pertama tetap identik setelah pemindaian ulang.

Screenshot diperiksa pada lebar 1440, 1024, 768, 390, dan 320px, termasuk tema gelap. Dialog tidak melebar keluar viewport; pada layar pendek isi bergulir dan tombol tetap terlihat. Hasil pengujian lokal: `tmp/scan-duplicate-popup-SOEPkU/results.json`.

Sepuluh unit test `attendance-scan-result` dan `attendance-scan` lulus. Build berhasil; svelte-check menghasilkan 0 error dan 117 warning pada 36 berkas (warning yang sudah ada). Server lokal dimuat ulang, listener `0.0.0.0:5152` diperiksa dan `/login` mengembalikan HTTP 200. Belum membuat installer atau rilis GitHub.
