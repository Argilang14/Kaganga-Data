# Rekap izin pulang dan absensi sekolah

Status **Pulang** pada popup murid belum tercatat dapat disimpan guru sesuai penugasan, tanpa menunggu persetujuan Kepala Sekolah atau scan keamanan. Ringkasan menghitungnya sebagai tidak hadir dengan kode `(p)`; murid keluar dari daftar belum tercatat. Catatan menyimpan tanggal, kegiatan, keterangan, dan akun pencatat. Pencatatan ini tidak membuat izin resmi atau konfirmasi perjalanan. Rekap harian sekolah mengikuti aturan yang sudah ada: Pulang pada kegiatan sekolah selain Apel Pulang dihitung sebagai izin untuk tanggal tersebut. Hari berikutnya tetap memerlukan catatan tersendiri atau izin dengan rentang tanggal.

## Indikator bulanan pada Cetak Dokumen

PDF **Rekap Absensi Kegiatan** memakai akumulasi per bulan pada rentang pilihan:

| Indikator                      | Batas masuk tabel       |
| ------------------------------ | ----------------------- |
| Izin                           | Minimal 4 hari sekolah  |
| Alfa                           | Minimal 1 hari sekolah  |
| Pulang                         | Minimal 4 hari kalender |
| Sakit                          | Minimal 4 hari sekolah  |
| Presensi harian belum tercatat | Minimal 4 hari sekolah  |

Hari tidak harus berurutan. Rentang lintas bulan dipisah sebelum batas indikator diterapkan. Satu murid dapat memiliki beberapa indikator. Angka di bawah batas tetap tersedia pada rekap per murid.

Indikator memakai sumber `loadSchoolPermitRecap`, sehingga izin guru tanpa scan security, penggabungan kegiatan menjadi satu hari, izin batal, libur kelas/jenjang, dan durasi pulang lintas bulan mengikuti perhitungan rekap. Hari sebelum tanggal masuk sekolah tidak dihitung. PDF hanya memuat murid aktif pada kelas dan cakupan akses akun. Untuk peringatan presensi kosong, hari berjalan dikecualikan; data kosong tidak menjadi alfa otomatis.

Tabel indikator mengganti judul **Hari** menjadi **Akumulasi** dan mencantumkan satuan. Bagian **Rincian Harian dan Kegiatan** dihapus dari PDF; data harian, halaman rekap, dan ekspor Excel tetap tersedia. Kolom **Nama Murid** hanya menampilkan nama, tanpa rincian tambahan di bawahnya. Judul kolom status memakai **Hadir, Terlambat, Sakit, Izin, Alfa, Pulang**, tanpa tambahan `(kegiatan)`. Perhitungan status tetap per kegiatan; satuan indikator tetap ditulis pada kolom **Akumulasi**. Kop, tabel rekap, catatan izin pulang, tanda tangan, dan ukuran cetak dipertahankan. Judul bagian tetap bersama tabel saat pindah halaman untuk mencegah header ganda dan tabel menyempit pada PagedJS.

Tindak lanjut lama hanya diwarisi jika murid, jenis, dan seluruh rentang tanggal cocok dengan indikator bulanan. Penanganan satu kejadian atau bulan lain tidak menandai akumulasi satu bulan sebagai selesai. Jika belum ada catatan yang cocok, status **Baru** disertai saran pemeriksaan. Perubahan ini tidak menambah formulir tindak lanjut atau mengubah pemantauan operasional 30–45 hari.

Verifikasi tambahan:

```powershell
node --test src/lib/attendance-permit-recap.test.ts src/lib/server/pdf/templates/absensi-kegiatan.test.ts
node scripts/test-attendance-permit-recap-copy.mjs
```

Fixture salinan mencakup batas 3/4 hari, alfa satu hari dengan beberapa kegiatan, sakit tidak berurutan, beberapa indikator pada satu murid, presensi kosong 3/4 hari, hari berjalan, tanggal masuk, murid nonaktif, izin tanpa scan, serta durasi lintas bulan yang tidak digabung untuk melewati batas. PDF dari route asli diperiksa teksnya; contoh berisi data fiktif tersedia di `output/pdf/rekap-absensi-kegiatan-bulanan.pdf`.

## Enam tahap yang diterapkan

1. Izin sekolah dan alfa dihitung satu kali per murid per hari sekolah. Hari sekolah mengikuti pengaturan presensi, semester, serta libur sesuai kelas dan jenjang. Catatan harian mendapat prioritas; jika kosong, gunakan kegiatan masuk sekolah pertama. Kegiatan pulang saja tidak membuktikan murid hadir pagi.
2. Izin pulang resmi dari guru langsung masuk rekap tanpa scan security. Satu izin = satu kejadian. Hari keberangkatan masuk izin sekolah jika waktu izin sudah mencakup jam masuk. Waktu keluar kosong perlu diperiksa; sistem tidak menganggap murid absen sejak pagi.
3. Identitas pencatat izin, pencatat kembali, serta petugas dan waktu scan security tersedia pada catatan izin. Scan melengkapi perjalanan pada ID izin yang sama. Catatan guru dan waktu scan keluar tidak saling menimpa. Kepulangan manual tidak membuat waktu scan fiktif.
4. Rekap harian, rekap kegiatan, Excel, dan PDF memakai perhitungan hari sekolah yang sama. Hitungan kegiatan lama tetap per kegiatan dan diberi satuan. Penambahan dibatasi pada kolom angka dan keterangan sumber di komponen lama.
5. Kejadian izin masuk bulan keberangkatan. Durasi dibagi sesuai irisan tanggal tiap bulan, termasuk tanggal kembali dan hari libur. Izin tumpang tindih tidak menggandakan hari. Kehadiran pagi tetap hadir jika murid pulang siang. Izin batal tidak dihitung. Izin melewati batas tidak terus membebaskan hari sekolah: hari tanpa bukti tetap **belum tercatat**, bukan alfa otomatis.
6. Pengujian memakai salinan SQLite. Halaman dan ekspor tidak membuat absensi, alfa, atau perjalanan. Data operasional dibandingkan sebelum dan sesudah pengujian.

## Sumber dan batas perhitungan

- `absensi_harian`: bukti harian utama.
- `absensi_kegiatan`: kegiatan masuk sekolah nyata jika bukti harian kosong; abaikan `auto_alfa`/metode `auto` untuk total resmi hari sekolah.
- `absensi_masa_sakit`: melengkapi hari sakit yang belum tercatat tanpa menimpa bukti nyata.
- `izin_pulang_murid`: tanggal/jam izin resmi, rencana kembali, kepulangan tercatat, dan pencatat.
- `perjalanan_murid`: bukti scan aktual; tidak menjadi syarat izin guru masuk rekap.

**Belum diverifikasi security** menghitung izin yang belum punya scan keluar atau sudah kembali manual tetapi belum punya scan kembali. **Perlu diperiksa** menghitung izin yang waktunya berbeda dari scan, sudah melewati batas, atau belum memiliki waktu keluar. Angka ini dapat beririsan; jangan dijumlahkan sebagai jumlah izin baru.

Durasi kalender memakai kepulangan tercatat jika sudah ada; izin terbuka memakai rencana kembali dan dibatasi sampai hari ini. Durasi tersebut bukan jumlah hari izin sekolah. Rentang laporan maksimal 366 hari; tanggal mendatang tidak menambah total.

Scan setelah izin ditutup manual tetap mengikuti pengamanan lama: data pertama dipertahankan, scan ulang tidak menimpa kepulangan. Riwayat audit tetap tersedia. Tidak ada migrasi atau perubahan penempatan murid.

Perhitungan rapor lama dan aksi **Sinkronkan Kehadiran Rapor** tetap terpisah. Fitur ini tidak mengganti angka rapor yang telah disimpan secara otomatis.

## Rujukan UI dan ukuran

Rujukan Rapkumer: `../rapkumer/src/routes/(administrasi)/administrasi/absensi/rekap/+page.svelte`. Struktur terverifikasi dari source: kartu/filter lama, `table` di dalam `overflow-x-auto`, serta angka `text-center`.

Kaganga: rekap kegiatan dan `AttendanceMonitoringPanel.svelte` yang sudah ada. CSS, susunan kartu, filter, modal, dan model cetak dipertahankan. Kolom tambahan memakai pola sel dan label seluler lama. PDF mempertahankan tabel dengan nama murid saja; akumulasi tindak lanjut tersedia pada tabel indikator, sedangkan sumber izin tersedia di sel alasan.

Ukuran berikut **Fallback Kaganga, diukur pada UI hasil perubahan**, bukan klaim ukuran Rapkumer:

| Viewport | Lebar konten | Lebar pembungkus tabel | Perilaku                              |
| -------- | -----------: | ---------------------: | ------------------------------------- |
| 1440     |      1103 px |                1061 px | Tabel bergulir mendatar di pembungkus |
| 768      |       719 px |                 677 px | Tabel bergulir mendatar di pembungkus |
| 390      |       351 px |                 317 px | Susunan seluler lama, dua kolom angka |
| 320      |       281 px |                 247 px | Susunan seluler lama, dua kolom angka |

Header desktop 48,5 px; padding sel desktop 14 px vertikal/16 px horizontal; padding angka seluler 8 px. Tidak ada perubahan ukuran input, tombol, modal, sidebar, atau navbar. Screenshot sesudah tersimpan di folder QA; pembanding sebelum memakai source yang sudah ada, tanpa klaim perbandingan screenshot sebelum/sesudah.

## Verifikasi

Jalankan dari root proyek:

```powershell
node scripts/test-attendance-permit-recap-copy.mjs
node scripts/test-attendance-travel-copy.mjs
node --test src/lib/attendance-monitoring.test.ts src/lib/attendance-travel.test.ts src/lib/attendance-pickup.test.ts src/lib/attendance-summary.test.ts src/lib/server/pdf/templates/absensi-kegiatan.test.ts
pnpm check
pnpm build
```

Uji rekap mencakup izin tanpa scan, lintas bulan, hari libur, beberapa kegiatan pada satu hari, pulang siang, pembatalan, koreksi guru, izin bertumpuk, waktu kosong, batas izin, validasi tanggal/jam, kesamaan halaman/Excel/PDF, pembacaan berulang, serta database operasional tidak berubah.

Uji perjalanan mencakup pembatasan peran, konfirmasi penjemput, QR dicabut, scan serentak/berulang, waktu offline, kepulangan tanpa scan keluar, pembatalan setelah berangkat, dan integritas SQLite. Fixture akun dapur dihubungkan ke pegawai aktif; fixture pegawai nonaktif mengikuti pencabutan sesi yang berlaku.

QA browser pada salinan database: 1440/768/390/320 px, tidak ada overflow halaman atau galat JavaScript; tabel, kolom rekap, fokus keyboard, buka/tutup dialog, dan penolakan akun dapur diperiksa. Hasil dan screenshot berada di `tmp/permit-recap-*/`.

Hasil pemeriksaan: 33 tes unit lulus; pengujian rekap dan perjalanan lulus; lint terfokus lulus; build berhasil; `pnpm check` menghasilkan 0 galat dan 119 peringatan yang sudah ada.
