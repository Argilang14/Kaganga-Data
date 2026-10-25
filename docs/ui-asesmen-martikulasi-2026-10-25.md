# Audit UI penilaian Martikulasi

## Acuan sebelum perubahan

Acuan pengguna adalah halaman Sumatif Kaganga lokal, bukan klaim pengukuran Rapkumer upstream terbaru. Pengukuran browser 25 Oktober 2026 berada di `tmp/asesmen-ui-before/measurements.json`, screenshot di folder yang sama. Referensi sumber: `src/routes/(input-nilai)/asesmen-sumatif/+page.svelte`, `src/lib/components/sumatif-bobot-modal.svelte`, dan token modal `src/app.css`.

| Elemen          | Sumatif lokal, viewport 1440 px                      | Martikulasi sebelum                              | Penerapan                                                                                |
| --------------- | ---------------------------------------------------- | ------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| Panel halaman   | Lebar 1103, padding 16, radius 8 px                  | Sama                                             | Pertahankan panel lokal                                                                  |
| Judul           | 20 px, tinggi baris 28 px                            | Sama                                             | Pertahankan                                                                              |
| Pencarian       | Lebar area tabel 1071, tinggi 40 px                  | Lebar 861 px, berbagi baris dengan dua tombol    | Pencarian penuh, aksi pindah ke header                                                   |
| Tabel           | Teks 14, padding sel 12 x 16 px                      | Sama; baris 62 px                                | Ikuti kelas table yang sama; rapikan lebar kolom dan teks                                |
| Header/baris    | 46/57 px pada data contoh                            | 47,5/62 px                                       | Pertahankan kepadatan; tambahan NIS membuat baris sedikit lebih tinggi                   |
| Aksi tabel      | Tinggi 32 px, teks 12 px, radius 4 px                | Sama; label Input/Edit                           | Samakan tombol Nilai/Lihat tanpa mengubah tujuan tautan                                  |
| Popup ringkas   | Lebar 512, padding 24, radius 8 px                   | Lebar 672; label dan kontrol berjajar tidak rata | Lebar maksimum 512; label di atas kontrol penuh                                          |
| Popup penilaian | Form Sumatif mempunyai struktur penilaian tersendiri | Lebar 1152, semua bagian ikut bergulir           | Fallback Kaganga: maksimum 1024 karena tabel aspek; token modal bersama, footer terpisah |
| Layar kecil     | Tidak meluap; tabel bergeser dalam pembungkus        | Tidak meluap pada halaman dasar                  | Pertahankan strategi scroll tabel, uji popup pada layar sempit/pendek                    |

Semua angka Sumatif di atas terukur dari Kaganga lokal (Fallback Kaganga sesuai permintaan pengguna), bukan ukuran bersertifikat Rapkumer upstream. Screenshot dibandingkan pada viewport 1440, 1024, 768, dan 390 px sebelum perubahan.

## Batas perubahan

Hanya presentasi halaman Martikulasi, aksesibilitas dialog, dan status tampilan. Tidak mengubah server action, field payload, database, rumus, batas peran, pemilihan kelas, atau ketuntasan manual. Ringkasan lengkap/belum lengkap dan pilihan massal tetap tersedia. Tidak menambahkan impor, bobot, atau mata pelajaran Sumatif ke Martikulasi karena alur penilaiannya berbeda.

## Verifikasi

Hasil pengukuran sesudah implementasi berada di `tmp/asesmen-ui-after/measurements.json`. Pada viewport 1440 px: header tabel 47,5 px, baris 62 px karena subbaris NIS, teks 14 px, padding sel 12 x 16 px, tombol aksi 32 px. Area pencarian mencakup label 1023 px dan tombol cari 40 px dengan jarak 8 px, di dalam lebar konten 1071 px. Popup massal kini 512 x 512 px, padding 24 px, radius 8 px. Pada HP teks tabel 13 px dan padding 10,4 x 12 px, mengikuti aturan responsif bersama yang juga dipakai Sumatif.

Tabel mempertahankan tujuh kolom Martikulasi, bukan menggantinya dengan kolom nilai Sumatif. Ringkasan besar dipadatkan, aksi massal ditempatkan di header, pencarian memakai satu baris penuh, dan status memakai badge lembut. Dialog memakai native dialog dan token bersama; label massal tersusun di atas kolom. Isi dialog bergulir, footer tetap terlihat. Escape tidak menutup dialog agar isian tidak hilang tanpa tindakan eksplisit; tersedia Batal/Tutup. Tombol penutupan dinonaktifkan selama penyimpanan.

- Build berhasil. Pemeriksaan Svelte: 0 error dan 117 warning pada 36 berkas (termasuk dua warning inisialisasi state Martikulasi yang sudah ada). Tidak ada warning aksesibilitas baru; pembungkus tabel tetap menerima fokus untuk scroll keyboard.
- Sepuluh unit test Martikulasi dan template cetaknya lulus.
- `scripts/test-asesmen-martikulasi-ui-copy.mjs` lulus empat kelompok: tabel dan pilihan murid, pencarian/pagination/editor/simpan satuan, simpan massal yang mempertahankan bidang lain, serta kegagalan validasi tanpa menutup editor. Kontrak nama field dibandingkan dengan HEAD. Tiga POST hanya dijalankan pada database salinan: dua sukses, satu kegagalan validasi yang disengaja.
- Screenshot dan pengukuran mencakup lebar 1440, 1024, 768, 390, dan 320 px, layar pendek, tema gelap, serta variasi kolom massal. Tidak ada overflow halaman atau JavaScript error. Hasil: `tmp/asesmen-martikulasi-ui-copy-U9BWfg/results.json`.
- Server lokal dimuat ulang. Listener `0.0.0.0:5152` dan HTTP 200 `/login` terverifikasi. Halaman Sumatif/Martikulasi diperiksa lagi melalui browser baca-saja pada empat viewport, tanpa menyimpan nilai di database asli; tidak ada JavaScript error.
- Tidak mengubah server action, database, izin, installer, atau rilis GitHub.
