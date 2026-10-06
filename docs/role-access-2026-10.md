# Pembatasan Role dan Waka Humas

- Guru: Data Murid, Jurnal Mengajar, Intrakurikuler, nilai intrakurikuler, Scan QR, Absensi Kegiatan, Rekap Kegiatan, SPPD, Dinas Luar dan Cetak Dokumen yang sebelumnya diizinkan.
- Wali Asuh: Data Murid, mata evaluasi/nilai keasramaan, absensi kegiatan, SPPD, Dinas Luar, Cetak Dokumen dan Raport Keasramaan.
- Wali Asrama: seperti Wali Asuh, ditambah Catatan Wali Asrama dan Rekap Nilai Keasramaan.
- Tim Dapur: Scan QR, input/rekap kegiatan kategori Makan, SPPD dan Dinas Luar. Kelas mencakup sekolah penugasan, bukan sekolah lain. Kegiatan sekolah, asrama dan sholat tidak dapat dibuka melalui URL atau API.
- Waka Humas: bidang Absensi dan Surat Menyurat mendapat izin penuh, ditambah akses dasar role. Tidak mendapat izin pengaturan sistem/manajemen pengguna.
- Kepsek, Waka Kurikulum, Waka Sarpras, Waka Kesiswaan, Waka Keasramaan dan Operator mempertahankan cakupan yang sudah ada.

## Pengoperasian

1. Admin menambahkan jenis pegawai Tim Dapur pada Data Pegawai, kemudian membuat akun dengan role Tim Dapur. Pegawai berjenis Lainnya juga dapat ditautkan ke role tersebut. Mapel/kelas tidak wajib diisi untuk Tim Dapur.
2. Waka Humas tersedia pada pilihan Jabatan Akses di tambah/edit akun Guru Mapel. Mapel tidak wajib untuk akun berjabatan.
3. Pengaturan Izin Pengguna menampilkan izin otomatis role/jabatan. Izin tambahan manual dari admin dipertahankan; cakupan murid/sekolah tetap diperiksa.
4. Guru dan wali hanya dapat mencetak jenis raport yang diizinkan, termasuk melalui endpoint token, PDF langsung dan PDF massal. Penugasan murid tetap berlaku.
5. Profil pribadi dibuka melalui Pengaturan > Profil Pegawai. Data kontak, alamat dan tempat/tanggal lahir dapat diedit sendiri. Identitas resmi, jenis pegawai, jabatan dan status tetap dikelola admin. Perubahan profil memakai pemeriksaan versi dan audit.
6. Akun baru tetap wajib mengganti kata sandi saat pertama login.

## Keamanan Pembaruan

### Pencatatan Sholat

- Guru Mapel dan Wali Kelas dapat mencatat Zuhur dan Asar (Ashar) pada tanggal absensi Senin-Jumat. Sholat lain dan tanggal Sabtu-Minggu tidak dapat dicatat oleh role guru biasa.
- Wali Asuh dan Wali Asrama tetap dapat mencatat lima waktu setiap hari, termasuk Sabtu-Minggu, untuk anak binaannya.
- Batas kelas/murid penugasan tetap berlaku. Akses pimpinan/operator tidak berubah.
- Aturan yang sama berlaku pada input satu murid, input massal, penghapusan status, scan QR, impor dan tautan pencatatan monitoring. Scan offline mengikuti tanggal saat scan ditangkap, bukan tanggal unggah.
- Tidak ada penguncian jam 07.00-16.00. Koreksi tanggal lama tetap memerlukan izin `absensi_koreksi_lama`; penambahan akses sholat tidak memberikan izin koreksi lama secara otomatis.
- Tidak diperlukan migrasi database untuk penambahan akses sholat ini.

Tidak diperlukan penghapusan data atau pengubahan role akun lama. Enum teks ditambah tanpa mengganti tabel atau isi database. Versi aplikasi dan installer belum dinaikkan; perubahan ini baru pada source lokal.

## Verifikasi

Jalankan `node --test src/lib/role-menu-access.test.ts src/lib/attendance-access.test.ts src/lib/access-position.test.ts`, `pnpm check`, `pnpm build`, lalu `node scripts/test-role-menu-copy.mjs`.

QA integrasi menyalin database dengan SQLite VACUUM INTO, memakai port 5164, menambahkan akun/data uji hanya pada salinan, lalu menghentikan server QA. Port 1206 tidak dioperasikan. Hasil dan screenshot tersimpan di `tmp/role-menu-qa-*/`.
