# Monitoring Sekolah dan Asrama

## Cakupan

Monitoring membaca catatan pada tanggal, sekolah, semester aktif, dan kelas yang
diizinkan untuk akun. Tidak ada pemindahan murid, perubahan QR, atau penulisan ulang
absensi lama.

## Kegiatan

| Lokasi  | Kegiatan                                   | Kode             |
| ------- | ------------------------------------------ | ---------------- |
| Sekolah | Masuk Sekolah (sumber lama Apel Berangkat) | apel_berangkat   |
| Sekolah | Pulang Sekolah (sumber lama Apel Pulang)   | apel_pulang      |
| Asrama  | Berangkat dari Asrama                      | asrama_berangkat |
| Asrama  | Tiba di Asrama                             | asrama_tiba      |
| Asrama  | Apel Malam                                 | apel_malam       |

Dua kegiatan asrama baru ditambahkan jika belum ada. Pengaturan kegiatan yang
sudah ada tidak ditimpa. Kegiatan baru tidak memakai alfa otomatis dan tidak masuk
rekap kehadiran rapor secara bawaan. Atur jam kegiatan sesuai jadwal sekolah di
pengaturan kegiatan; jangan menganggap jam keberangkatan dan kedatangan sama.

## Alur Harian

1. Wali mencatat atau memindai **Berangkat dari Asrama**.
2. Guru mencatat atau memindai **Masuk Sekolah**.
3. Guru mencatat atau memindai **Pulang Sekolah**.
4. Wali mencatat atau memindai **Tiba di Asrama**.
5. Wali mencatat **Apel Malam** sebagai kegiatan terpisah.

Pilih kegiatan dengan benar sebelum memindai. Keberangkatan bukan bukti
kedatangan. Satu pemindaian tidak mengisi beberapa kegiatan sekaligus.

## Membaca Monitoring

Di Absensi > Monitoring dan Rekap > Monitoring, pilih tab Sekolah atau Asrama,
tanggal, dan kelas. Keduanya menampilkan dua perjalanan yang sama:

- Menuju sekolah: berangkat dari asrama dibandingkan dengan masuk sekolah.
- Kembali ke asrama: pulang sekolah dibandingkan dengan tiba di asrama.
- Belum tercatat tiba: ada catatan berangkat, tetapi belum ada catatan tiba.
- Perlu diperiksa: keterangan bertentangan atau waktu tiba mendahului berangkat.
- Perjalanan belum tercatat: belum ada bukti berangkat maupun tiba, bukan alfa.

Ringkasan dapat diklik atau disaring melalui pilihan Perjalanan. Angkanya mengikuti
cakupan kelas dan hak akses, bukan seluruh sekolah tanpa batasan.

## Keterangan Terhubung

Sakit/izin dibaca pada pasangan perjalanan yang sama dan hanya melengkapi sel
Monitoring yang belum tercatat. Label **Info dari ...** menunjukkan sumbernya.
Catatan nyata di tujuan tidak ditimpa. Alfa tidak disalin otomatis.

Keterangan pagi tidak diasumsikan berlaku sampai malam; sholat, makan, dan apel
malam tetap terpisah. Koreksi sumber langsung mengubah hasil baca pada muat ulang
atau pembaruan berkala, tanpa meninggalkan salinan keterangan lama.

Izin pulang ke rumah tetap memakai data izin pulang dan rentang waktunya yang
sudah ada. Pulang sekolah bukan izin pulang ke rumah. Izin sebagian hari hanya
dipakai pada kegiatan dengan jam yang diketahui; jika jam belum diatur, sistem
tidak menebak ketidakhadiran.

Informasi terhubung adalah hasil baca Monitoring, bukan catatan absensi tambahan.
Rekap kegiatan dan rapor tetap memakai catatan sumber masing-masing.

## Akses dan Batasan

Guru tetap mencatat kegiatan sekolah sesuai izin. Wali Asuh tetap mengikuti
penugasan murid. Untuk sementara, Wali Asrama dapat membaca dan mencatat absensi
semua murid aktif di sekolah dan semester aktif tanpa penugasan kelas/murid.
Batas tanggung jawab kegiatan tidak berubah: asrama, sholat, dan makan, bukan
input kegiatan sekolah. Monitoring, rekap, ekspor, dan ringkasan absensi mengikuti
cakupan ini. Tim dapur hanya memperoleh monitoring makan.

Wali Asrama boleh membaca foto murid aktif di semester aktif untuk identifikasi
absensi. Akses mengunggah, mengubah, atau menghapus foto serta akses nilai/data
murid di luar absensi tetap mengikuti penugasan dan izin sebelumnya. Pengaturan,
impor, pengelolaan QR, dan koreksi tanggal lama tidak dibuka otomatis.
Penugasan lama tidak dihapus. Kebijakan sementara dipusatkan pada
hasSchoolWideAttendanceStudentAccess sehingga dapat dikembalikan tanpa mengubah
data penugasan. Akses pimpinan/admin tetap mengikuti izin operasional yang ada.

Tautan lama dengan tab=malam tetap membuka Asrama dan menampilkan Apel Malam.
Belum ada persetujuan khusus, popup surat sakit/izin, notifikasi WhatsApp, atau
monitoring kehadiran guru di kelas.

## Pengujian

- Unit: node --test src/lib/attendance-school-dorm.test.ts src/lib/attendance-monitoring.test.ts
- Integrasi pada salinan SQLite: node scripts/test-attendance-monitoring-copy.mjs
- Aplikasi: pnpm check dan pnpm build

Skrip integrasi menolak port 1206 dan tidak menghentikan proses yang sudah berjalan.
Semua perubahan data uji dilakukan pada database di folder tmp, bukan database sekolah.
