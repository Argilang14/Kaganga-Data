# Cetak daftar murid dan wali asuh

Lokasi: Cetak → Cetak Dokumen → Data Murid → Daftar Murid dan Wali Asuh.

## Hasil cetak

- Per kelas: nomor, nama murid, NIS, asrama, wali asuh.
- Per asrama: dua kolom kotak wali asuh mengikuti PDF referensi pengguna; setiap kotak berisi jumlah anak, nomor, nama anak, dan kelas. Daftar panjang dilanjutkan dalam kotak berjudul lanjutan, dengan nomor berurutan.
- Per wali asuh: nomor, nama anak, kelas, wali kelas.

Ketiganya memakai kop sekolah yang tersedia, termasuk kop potret kustom dari pengaturan cetak, dan label semester/tahun ajaran aktif. Nama wali kelas diambil dari Data Kelas. Nama wali asuh mengikuti pegawai yang ditautkan pada murid. Murid tanpa tautan wali asuh tetap tercetak pada daftar kelas/asrama; nama lama yang belum ditautkan ditandai. Pegawai berbeda dengan nama sama tidak digabung.

Kop bawaan memakai varian ringkas agar nama kementerian dan sekolah lebih padat. Logo dibatasi 18 mm, teks kementerian 11 pt, dan nama sekolah 9 pt; batas kiri/kanan kop sejajar dengan tabel. Perubahan ini berlaku pada ketiga daftar tersebut.

## Batas data

Tidak ada migrasi atau perubahan data operasional. Daftar dibaca dari semester aktif. Penempatan asrama mengikuti identitas murid dan tanggal penempatan yang berlaku, termasuk murid yang belum memiliki kelas. Data pindah/keluar/alumni dan identitas yang perlu diperiksa dikecualikan mengikuti penyaring murid aktif yang sudah ada.

Endpoint GET/POST `/api/pdf/daftar-wali-asuh` mewajibkan akses cetak dokumen dan menu murid, sekolah yang sesuai, serta pegawai aktif bagi akun selain admin. Cakupan mengikuti `studentAccessCondition(..., 'assigned')` yang sudah berlaku. Kelompok di luar cakupan ditolak. POST memvalidasi jenis cakupan dan ID, mencatat audit cetak, serta mengirim PDF tanpa cache bersama.

## Rujukan UI dan ukuran

Rujukan Rapkumer: `../rapkumer/src/lib/components/cetak/StudentInformationPrint.svelte`; padanan Kaganga: `src/lib/components/cetak/StudentInformationPrint.svelte`. Form, tombol pratinjau, tautan PDF, dan status mengikuti panel tersebut. Layout aplikasi bersama dipertahankan.

| Bagian | Ukuran/pola | Status sumber |
| --- | --- | --- |
| Select dan tombol | Tinggi 40 px (`h-10`) | Verified Rapkumer dan padanan Kaganga |
| Form | Dua kolom mulai breakpoint `sm`, satu kolom pada layar kecil | Verified Rapkumer |
| Jarak form | `gap-4`, `space-y-4` | Verified Rapkumer |
| Panel luar | `p-4`, `rounded-lg`, `shadow-md` | Fallback Kaganga, mengikuti panel cetak yang ada |
| PDF asrama | Dua kolom kotak, header abu-abu, daftar bernomor | PDF referensi pengguna; kelas dan kop ditambahkan atas permintaan |

## Pemeriksaan

`node scripts/test-caregiver-roster-copy.mjs` membuat salinan database dan sekolah sintetis. Pengujian mencakup tiga jenis PDF, identitas penempatan, periode aktif, murid tanpa kelas/wali asuh/asrama, status keluar, nama wali asuh sama dengan ID berbeda, pembatasan guru/wali asuh, dan validasi pilihan.

PDF tiga cakupan dan uji 65 anak pada satu wali asuh dirender lalu diperiksa. Ekstraksi teks memastikan anak terakhir tetap tercetak. Uji browser memakai salinan database, dengan lebar 1440, 1024, 768, 390, dan 320 px serta tiga alur pratinjau/unduh.

`pnpm check`: 0 error, 119 warning yang sudah ada. `pnpm build`: berhasil. ESLint terfokus pada modul baru dan logika cetak yang disentuh: berhasil.
