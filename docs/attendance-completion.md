# Pemeriksaan akhir absensi

Implementasi issue #5 dilakukan lokal, tanpa rilis atau migrasi database baru.
Sumber acuan struktur: Rapkumer `1df6d35`, komponen `global-modal.svelte` memakai
dialog native, konten flex, batas tinggi 85vh dan ukuran `sm:max-w-2xl`.
Popup ringkasan Kaganga yang sudah ada memakai `max-w-3xl`, padding bawaan
modal-box, radius `rounded-lg`, batas 90dvh dan tombol DaisyUI. Ukuran tersebut
dipertahankan agar pemilih cakupan dan pratinjau WhatsApp tidak berubah.
Ini adaptasi Kaganga, bukan ukuran piksel Rapkumer yang diklaim identik.

Kontrak:

- Selesai hanya berlaku pada perangkat sendiri, tidak mengunci sesi bersama.
- Sumber jumlah dan murid belum tercatat berasal dari server, bukan riwayat HP.
- Proyeksi sakit/izin pasangan sekolah-asrama mengikuti helper monitoring.
- Daftar belum tercatat tetap tersedia dalam ringkasan sampai statusnya diketahui.
- Input manual hanya untuk sasaran, kegiatan, dan tanggal yang diizinkan.
- Hanya menambah catatan kosong. Catatan guru lain tidak ditimpa.
- Pulang membutuhkan izin yang berlaku. Popup tidak menerbitkan izin dan tidak
  menggantikan pemindaian keamanan. Izin berlaku sudah terhitung dalam ringkasan.
- Status kosong tidak disimpan, tidak ada konversi otomatis ke alfa.
- Penyimpanan per murid dilaporkan terpisah; kegagalan mempertahankan pilihan.
- Pilihan belum disimpan dilindungi saat menutup, Escape, backdrop dan navigasi keluar.
- Antrean offline, proses scan berjalan, dan koneksi putus menghalangi konfirmasi.
- Konfirmasi mengambil ulang data; jika daftar belum tercatat berubah, pengguna
  harus memeriksa ulang sebelum selesai.

Backup awal privat: `dist/backups/attendance-finish-2026-10-24T16-58-45-087Z`.
1.200 berkas kode tersalin; SQLite integrity ok, foreign key 0.

## Acuan ukuran

| Komponen | Acuan | Ukuran yang dipakai |
| --- | --- | --- |
| Dialog native dan isi flex bergulir | Terverifikasi dari sumber Rapkumer | Struktur dipertahankan |
| Lebar, tinggi maksimum, dan radius | Fallback Kaganga yang sudah ada | `max-w-3xl`, `90dvh`, `rounded-lg` |
| Form pemilih konteks | Fallback Kaganga | Dua kolom mulai `sm`, satu kolom di HP |
| Daftar konfirmasi | Adaptasi Kaganga | Identitas, status, keterangan; ditumpuk di HP |
| Tombol bawah | Adaptasi Kaganga | Ikon berlabel pada HP, teks pada desktop; konfirmasi satu baris penuh di HP |

## Hasil pengujian

- `pnpm check`: 0 error; 116 warning yang sudah ada pada proyek.
- ESLint pada berkas fitur: lulus.
- `pnpm build`: lulus.
- Tes unit absensi dan izin menu: 92 lulus, 0 gagal.
- Pengujian API/browser dengan database salinan: 13 kelompok skenario lulus.
- SQLite salinan: `integrity_check=ok`, tidak ada pelanggaran foreign key.
- Desktop 1440x1000, tablet 768x1024, HP 390x844: tidak ada luapan horizontal
  halaman atau dialog. Screenshot hasil diperiksa, termasuk daftar yang digulir,
  status kosong, gagal simpan, dan antrean belum tersinkron.
- Tab tidak masuk ke halaman di belakang dialog; Escape mempertahankan draf
  sampai pengguna memilih tetap memeriksa atau mengabaikannya.
- Dua akun mencatat serentak menghasilkan satu catatan. Status dari QR petugas
  lain tidak ditimpa; nama petugas ditampilkan dalam hasil penyimpanan.
- Guru, wali asuh, wali asrama, tim dapur, dan keamanan diuji sesuai batas
  kelas/kegiatan. Ringkasan seluruh sekolah tidak memberi hak input tambahan.
- Gagal simpan dan koneksi putus mempertahankan pilihan. Antrean scan yang
  belum tersinkron menonaktifkan konfirmasi selesai.
- Jika petugas lain memperbarui daftar setelah konfirmasi pertama, dialog
  tetap terbuka untuk pemeriksaan ulang. Selesai di satu perangkat tidak
  mengunci petugas lain dan tidak mengubah murid belum tercatat menjadi alfa.

Bukti QA lokal privat: `tmp/attendance-completion-qa-aGHeVC/result.json`
dan screenshot dalam direktori yang sama. Skrip regresi:
`scripts/test-attendance-completion-copy.mjs` (menggunakan backup privat di atas).

Perbandingan hash terhadap 1.200 berkas backup memastikan hanya lima berkas
yang sudah ada diubah pada pekerjaan ini: helper ringkasan, pemuat ringkasan,
mutasi absensi, dialog ringkasan, dan halaman scan. Lima berkas baru memuat
parser, tes unit, endpoint, skrip QA, dan catatan ini. Perubahan lain yang
sebelumnya ada di working tree dipertahankan. Tidak ada migrasi skema, perubahan
versi, push, atau penerbitan rilis pada pekerjaan ini.
