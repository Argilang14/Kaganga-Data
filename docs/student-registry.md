# Peserta Didik

- **Semua Murid** menggabungkan identitas murid lintas semester, termasuk status nonaktif, riwayat kelas, dan riwayat asrama.
- **Murid Pasif** memuat murid yang belum memiliki kelas pada semester aktif atau belum memiliki penempatan asrama, serta murid pindah, keluar, alumni, dan identitas yang perlu diperiksa.
- Tambah murid dimulai dari Murid Pasif. Semester aktif wajib tersedia; kelas boleh kosong.
- **Murid Kelas** hanya untuk admin dan wali kelas sesuai penugasan. **Data Murid Asrama** hanya untuk admin dan wali asrama sesuai penugasan. Pemberian izin menu umum tidak membuka kedua halaman ini untuk peran lain.
- Penempatan mengambil murid aktif dari daftar pasif. Status pindah/keluar/alumni harus dipulihkan melalui Semua Murid, tab Status & alumni, sebelum penempatan. Riwayat semester sebelumnya tidak ditimpa.
- Pencarian penempatan menampilkan maksimal 200 hasil dan menyimpan maksimal 100 pilihan sekaligus.
- Data Asrama menggunakan penempatan dan riwayat asrama yang sudah ada. Pegawai wali asrama harus aktif dengan jenis Wali Asrama; wali kelas harus berjenis Guru.
- Migrasi kelas opsional membuat cadangan database sebelum mengubah tabel lama. Data nilai, relasi, indeks, trigger, dan urutan ID dipertahankan.

Pola tampilan mengikuti sumber Rapkumer lokal: `kelas/+page.svelte` memakai dua kolom mulai `lg`, jarak `gap-6`, isi kartu `p-4`, dan judul `text-xl`; formulir murid memakai `modal-box p-4 sm:max-w-2xl`. Ukuran kartu diverifikasi dari sumber. Tabel daftar murid memakai ukuran rujukan desktop dan gulir horizontal lokal; rinciannya tercatat dalam audit berikut.

Pemeriksaan: `node --test src/lib/murid-permissions.test.ts src/lib/server/db/murid-unassigned.test.ts` dan `node scripts/test-student-registry.mjs`. Pengujian integrasi menggunakan salinan database dalam `tmp/`, bukan mengubah data sekolah asal.

## Audit tampilan Peserta Didik

Rujukan utama: checkout lokal `../rapkumer`, khususnya `src/app.css`, `src/routes/(informasi-umum)/murid/+page.svelte`, `src/lib/components/global-modal.svelte`, dan `src/lib/components/kelas/delete-kelas-modal.svelte`. Pengukuran browser memakai data sintetis yang sama pada lebar 1440 px. Bukti sebelum dan sesudah disimpan dalam `tmp/student-ui-review/`.

| Elemen    | Rujukan dan ukuran                                                                         | Perbaikan                                                                                                                                      | Keyakinan                                                                          |
| --------- | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Shell     | Sidebar 280 px; navbar 64 px; area konten 1150,4 px pada viewport 1440 px                  | Ukuran shell dipertahankan; daftar murid memakai opt-in ruang kerja penuh yang sudah tersedia                                                  | Verified Rapkumer, diukur browser                                                  |
| Tabel     | Teks 14 px; padding sel 12 px vertikal dan 16 px horizontal; kepala 49,3 px; baris 56,8 px | Kolom nama fleksibel, status/kelas/asrama/aksi terkontrol; identitas dua baris boleh menambah tinggi sesuai isi                                | Verified Rapkumer; tinggi isi adaptif                                              |
| Kolom     | Nomor 52 px; tanggal 144 px; aksi 104 px; tabel minimal 864 px                             | Nomor memakai 52 px; tabel registri minimal 864 px. Kolom status 128 px, kelas 144 px, asrama 192 px, riwayat 128 px disesuaikan dengan isinya | Verified Rapkumer untuk nomor dan lebar minimum; Fallback Kaganga untuk kolom baru |
| Dialog    | Token lebar 42 rem; padding 24 px desktop dan 16 px seluler; radius 8 px                   | Riwayat memakai GlobalModal; penempatan memakai dialog terbatas dengan isi yang dapat digulir                                                  | Verified Rapkumer dari sumber                                                      |
| Kontrol   | Tombol dan input mengikuti DaisyUI yang sudah terpasang                                    | Pencarian, pilihan konteks, dan tindakan satu kelompok; daftar pilih ganda diganti checkbox berlabel                                           | Verified Rapkumer untuk komponen; Fallback Kaganga untuk susunan baru              |
| Kepadatan | Data Rapor/kelas dan nama wali memiliki hierarki terpisah                                  | Judul ganda dihapus; riwayat dikeluarkan dari sel tabel; nama asrama yang sama tidak ditampilkan dua kali                                      | Perbaikan presentasi Kaganga                                                       |

Perubahan ini hanya mencakup tampilan. Kontrak pemuatan data, status murid, hak akses, penempatan, dan riwayat tetap memakai layanan yang sama.

### Hasil pemeriksaan browser

Pada 1440 × 1000 px, tabel registri memiliki lebar 1069,6 px; kepala 45,8 px dan baris identitas dua baris 66,8 px. Kolomnya 52 / 425,6 / 128 / 144 / 192 / 128 px. Tinggi kepala berbeda dari tabel kelas rujukan karena tidak memuat checkbox. Gaya seluler bawaan tetap memakai teks tabel 13 px dan padding 10,4 × 12 px; desktop memakai 14 px dan 12 × 16 px.

| Lebar viewport | Lebar tabel registri | Lebar wilayah gulir | Overflow halaman |
| -------------- | -------------------- | ------------------- | ---------------- |
| 1920 px        | 1549,6 px            | 1550 px             | Tidak            |
| 1440 px        | 1069,6 px            | 1070 px             | Tidak            |
| 1280 px        | 909,6 px             | 910 px              | Tidak            |
| 1024 px        | 864 px               | 654 px              | Tidak            |
| 768 px         | 864 px               | 686 px              | Tidak            |
| 390 px         | 864 px               | 318 px              | Tidak            |
| 320 px         | 864 px               | 247 px              | Tidak            |

Murid Kelas juga diperiksa pada 1440, 1024, 768, 390, dan 320 px. Nama panjang membungkus; kolom aksi tetap bisa dicapai lewat gulir dan keyboard. Tombol Ambil murid menempati satu baris pada seluler, diikuti Murid Pasif dan menu opsi. Halaman pembanding Data Kelas tetap dibatasi 1280 px pada viewport 1920 px.

Interaksi yang lulus: riwayat kelas dan asrama, penutupan dengan Escape dan pengembalian fokus, pencarian kandidat, checkbox, tujuan mengikuti kelas/asrama terpilih, simpan lalu muat ulang penempatan kelas/asrama, pilihan tetap tercentang saat kategori asrama ditolak, edit kapasitas asrama lalu muat ulang, asrama kosong, pencarian kosong, dan mode gelap. Dialog penempatan diuji pada 320 × 844, 390 × 844, dan 844 × 390 px; isi dapat digulir sampai tombol tindakan. Semua mutasi memakai database uji dalam `tmp/`.

Bukti visual: `before-all-1440.jpg`, `reference-class-1440.jpg`, `after-all-1440.jpg`, `after-all-320.jpg`, `after-history-1440.jpg`, dan `after-dorm-dark-1440.jpg` dalam `tmp/student-ui-review/`.

Validasi: 72 tes regresi dan `node scripts/test-student-registry.mjs` lulus. `pnpm check` selesai dengan 0 galat dan 116 peringatan. `pnpm build` selesai, termasuk adapter Node. ESLint khusus tujuh file Svelte yang disentuh, pemeriksaan format file UI/dokumentasi, dan `git diff --check` lulus. Lint global terhenti pada sintaks lama `docs/keasramaan.html` dan `docs/rapor.html`, disertai temuan format repo di luar perapian UI.

### Penarikan kelas dan integrasi arsip

Murid Kelas kini memiliki pilihan kelas langsung di atas tabel. Pilih kelas, buka Ambil murid, centang kandidat dari Murid Pasif, lalu Tempatkan. Tujuan mengikuti kelas yang dipilih. Pilihan terbatas pada kelas penugasan wali di semester aktif; murid yang sudah memiliki kelas tidak ditarik ulang melalui alur ini.

Menu Arsip Murid & Alumni digabung ke Semua Murid melalui tab Status & alumni. Pemulihan status, pratinjau penempatan lintas semester, pemeriksaan identitas, riwayat, dan penghapusan dengan pratinjau serta cadangan memakai layanan arsip yang sama. Izin arsip dan batas sekolah tetap diperiksa pada server. Tab hanya ditampilkan kepada pengelola arsip. Tautan lama `/murid/arsip` mengarah ke tab baru dengan filter tetap terbawa; Riwayat Rapor tetap tersedia terpisah.

Tab navigasi memakai DaisyUI terpasang (Fallback Kaganga). Tabel status mempertahankan lebar minimum 1040 px dan kini bisa digulir melalui keyboard. Pemeriksaan browser mencakup penempatan ke kelas pilihan lalu muat ulang, pemulihan status melalui tab baru, filter alumni kosong, reset filter, serta lebar 320, 390, dan 1440 px tanpa overflow halaman. Bukti: `class-intake-1440.jpg`, `class-intake-320.jpg`, `all-status-1440.jpg`, dan `all-status-390.jpg` dalam `tmp/student-ui-review/`. Seluruh mutasi memakai database uji.

Validasi tambahan: 74 tes regresi dan integrasi pemulihan/penolakan akses/pengalihan URL lama lulus. `pnpm check` menghasilkan 0 galat dan 116 peringatan. ESLint file yang diubah dan `pnpm build` termasuk adapter Node lulus. Murid Kelas juga diperiksa pada 1920, 1280, 1024, dan 768 px tanpa overflow halaman. Dua skrip QA identitas/satuan pendidikan memakai URL tab baru; sintaksnya diperiksa dengan `node --check`, rangkaian lengkap keduanya belum dijalankan ulang.

### Lima tahap status pasif dan perpindahan

1. Status sekolah tetap aktif selama **Menunggu naik kelas** atau **Menunggu pindah kelas**. Status pindah sekolah, keluar sekolah, dan lulus memerlukan pemulihan eksplisit.
2. **Jadikan pasif**, baik per murid maupun pilihan murid, mewajibkan alasan dan tanggal yang valid, tidak melewati hari ini. Catatan maksimal 500 karakter. Kelas saat ini dikosongkan dan penempatan asrama terbuka ditutup dalam satu transaksi. Tanggal sebelum penempatan asrama ditolak tanpa perubahan.
3. Murid Pasif menampilkan status tunggu, tanggal, catatan, kelas terakhir, dan asrama terakhir. Filter status tersedia. Keterangan terakhir menunjukkan riwayat, bukan penempatan aktif.
4. Pindah kelas memakai semester yang sama; naik kelas memakai semester berbeda. Pilih kelas tujuan pada semester aktif, buka **Ambil murid**, centang murid, lalu **Tempatkan**. Status tunggu selesai sesudah penempatan kelas. Murid masih tampil pasif bila asramanya kosong. Pemulihan murid pindah/keluar/lulus mengembalikannya tanpa kelas dan asrama.
5. Jurnal `murid_perpindahan_kelas` menyimpan setiap pelepasan kelas, termasuk beberapa perpindahan dalam semester sama. Snapshot riwayat rapor tetap memakai tabel asal. Rapor murid tanpa kelas aktif memakai konteks kelas yang tersimpan dalam riwayat.

Migrasi menambah kolom status tunggu dan jurnal tanpa mengubah penempatan murid lama secara massal. Cadangan SQLite dibuat sebelum migrasi pertama. Riwayat perpindahan sebelum jurnal tersedia tidak ditebak; snapshot kelas lama tetap ditampilkan.

Ukuran baru: kolom status 160 px (Fallback Kaganga, memberi ruang untuk alasan tunggu); tabel riwayat minimal 576 px dengan gulir horizontal dan fokus keyboard (Fallback Kaganga). Dialog pasif memakai `modal-box` yang sudah ada; form menggunakan kontrol DaisyUI bawaan. Rujukan Rapkumer dan ukuran shell di audit sebelumnya tetap berlaku.

Validasi pada salinan database: perpindahan X A ke X B dan kembali, pelepasan asrama, naik kelas beda semester, penolakan semester salah, pemulihan tiga status akhir, penolakan akun di luar penugasan/sekolah, pembatalan transaksi gabungan, tanggal salah, foto/QR/catatan/absensi tetap utuh, konteks rapor saat kelas kosong, dan pemeriksaan foreign key. Perintah: `node --test src/lib/student-status.test.ts src/lib/murid-permissions.test.ts src/lib/server/db/murid-unassigned.test.ts src/lib/dormitory.test.ts src/lib/navigation-menu.test.ts src/lib/role-menu-access.test.ts` (22 tes) serta `node scripts/test-student-registry.mjs`.

Browser: simpan pasif per murid, tarik ke kelas lain dan muat ulang, pasif melalui pilihan murid, validasi alasan wajib, filter status tunggu, riwayat perpindahan, gulir keyboard, Escape dan pengembalian fokus. Form diuji pada 320 px; daftar pada 390 dan 1440 px; riwayat pada 320 dan 1440 px. Bukti: `passive-form-320.jpg`, `passive-list-390.jpg`, `passive-list-1440.jpg`, `passive-history-1440.jpg`, dan `passive-status-1440.jpg` dalam `tmp/student-ui-review/`.

Pemeriksaan akhir tahap status: 33 tes terfokus lulus (termasuk identitas dan migrasinya), integrasi salinan database lulus, `pnpm check` 0 galat/116 peringatan lama, dan ESLint file yang diubah lulus.

### Kolom Murid Asrama

Rujukan: `../rapkumer/src/routes/(informasi-umum)/murid/+page.svelte` memakai tombol Detail (`eye`) dan arsip (`del`) berkelompok dengan `btn btn-sm btn-soft`; Kaganga Murid Kelas memakai pola sama dengan tindakan Jadikan pasif. Shell, filter, nama, identitas, status, dan Riwayat dipertahankan.

| Elemen        | Ukuran/aturan                                                             | Bukti                                                      |
| ------------- | ------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Shell desktop | Sidebar 280 px; viewport awal 1536 × 639 px                               | Diukur pada UI Kaganga sebelum perubahan                   |
| Header/sel    | Header 45,8 px; padding 12 px × 16 px; baris contoh 65,8 px               | Diukur pada UI Kaganga sebelum perubahan                   |
| Kolom lama    | No 52 px; Status 160 px; Kelas 144 px; Asrama 192 px; Riwayat 128 px      | Diukur pada UI Kaganga sebelum perubahan                   |
| Wali Asuh     | 13 rem; nama pegawai terhubung, lalu nama lama jika tautan belum tersedia | Fallback Kaganga, tambahan sesuai permintaan               |
| Aksi          | 6,5 rem; Detail dan Jadikan pasif mengikuti Murid Kelas                   | Ukuran/pola terverifikasi dari source Rapkumer dan Kaganga |
| Tabel asrama  | Minimum 73,5 rem, gulir di pembungkus dan fokus keyboard lama             | Fallback Kaganga; tambahan ruang untuk dua kolom baru      |

Kolom baru hanya tampil pada Murid Asrama. Tombol pasif mengikuti izin yang sudah ada, termasuk batas kelas wali kelas; Wali Asrama tidak memperoleh hak mengosongkan kelas melalui tambahan tombol ini.

Verifikasi perubahan kolom: tampilan desktop 1536 × 639 px memperlihatkan delapan kolom dengan nama wali asuh terisi dan keadaan Belum ditentukan. Pengujian salinan database `node scripts/test-student-registry.mjs` lulus, termasuk prioritas nama pegawai atas snapshot lama, nama kosong, aksi admin, pembatasan Wali Asrama, dan gabungan role wali kelas/asrama. ESLint dan Prettier terfokus lulus; `pnpm check` menghasilkan 0 galat dan 119 peringatan. Uji klik dialog dan ukuran tablet/seluler belum selesai: kontrol browser dihentikan karena alat tidak dapat memverifikasi URL yang diizinkan. Tidak ada mutasi data murid operasional dalam pengujian.
