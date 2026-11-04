# Penilaian keasramaan

Mata evaluasi, input nilai, catatan wali asrama, rekap, dan cetak rapor memakai
penempatan asrama serta semester. Kelas akademik tidak menjadi syarat penilaian.

## Langkah operator

1. Tetapkan wali asrama dari pegawai melalui Data Asrama dan tempatkan murid pada asrama.
2. Buka formulir murid, pilih tab Wali Asuh, lalu pilih pegawai yang membina anak.
   Penugasan memakai ID pegawai; dua pegawai bernama sama tetap berbeda.
3. Pada Mata Pelajaran > Keasramaan, pilih asrama dan semester. Buat mata evaluasi,
   indikator, dan tujuan. Pengelola dapat menyalin susunan kelas lama secara eksplisit;
   nilai lama tidak ikut disalin.
4. Wali asuh membuka Input Nilai > Keasramaan, memilih asrama dan anak binaannya,
   lalu mengisi seluruh mata evaluasi. Excel memakai template baru untuk asrama dan semester terpilih.
5. Wali asrama mengisi catatan dan memeriksa rekap penghuni asrama yang ditugaskan.
6. Cetak > Cetak Raport > Rapor Asrama membuka data berdasarkan penempatan asrama.
   Aktifkan riwayat untuk membaca penempatan terdahulu.

Wali asuh hanya menilai anak binaannya. Wali asrama mengelola susunan evaluasi,
catatan, dan rekap; perannya tidak memberi hak menilai semua penghuni. Pengelola
sekolah tetap dapat mengelola data sesuai hak aksesnya. Guru mapel diperiksa berdasarkan
kelas dan mata pelajaran yang ditugaskan pada jalur penilaian akademik.

## Perpindahan dan arsip

- Pindah kelas mempertahankan wali asuh dan nilai asrama.
- Pindah asrama mengakhiri penempatan lama. Nilai lama tetap pada penempatan tersebut;
  penempatan baru mulai tanpa nilai. Riwayat hanya dapat dibaca.
- Susunan dan tujuan yang sudah memiliki nilai dikunci dari pengubahan atau penghapusan.
- Tabel nilai, tujuan, dan catatan berbasis kelas lama dipertahankan. Pengelola dapat
  membaca data lama melalui bagian riwayat. Data lama tidak ditebak penempatan asramanya.
- PDF final tersimpan dibaca dari arsip dan diperiksa integritasnya. Nilai langsung
  dari beberapa penempatan dalam semester sama tidak digabung otomatis saat finalisasi.
- Arsip final masih memakai riwayat kelas yang tersedia. Anak tanpa riwayat kelas dapat
  mencetak PDF asrama langsung; formulir arsip final khusus penempatan belum tersedia.

## Migrasi dan pemeriksaan

`ensureDormEvaluationSchema()` dipanggil saat bootstrap. Empat tabel baru memakai
awalan `asrama_evaluasi`; `murid.wali_asuh_pegawai_id` ditambahkan. Nama wali asuh lama
hanya dipetakan jika tepat satu pegawai aktif dengan role wali asuh cocok dalam sekolah yang sama.
Nama kosong atau ambigu menunggu pilihan operator. Kolom wali asrama lama tetap disimpan
sebagai data historis; formulir dan detail murid tidak lagi meminta isian tersebut.

Backup sebelum migrasi:
`data/database-backup-before-dorm-evaluation-2026-11-02T12-06-30-877Z.sqlite3`.
Baseline jumlah baris berada di
`tmp/keasramaan-migration-2026-11-02T12-06-30-877Z/baseline.json`.

Uji salinan database: `node scripts/test-dorm-evaluation-copy.mjs`.
Uji regresi cetak lama: `node scripts/test-rapor-attendance-copy.mjs`.
Uji tidak mengubah database operasional. Artefak dan hasil disimpan pada `tmp/`.

Hasil pemeriksaan 2 November 2026:

- Migrasi database operasional selesai. Hash seluruh baris dan kolom lama pada
  sembilan tabel yang diperiksa tetap sama dengan backup; galat foreign key nol.
- Masih ada 309 murid aktif tanpa penugasan wali asuh pada sekolah ID 5.
  Operator perlu memilih wali asuh sebelum akun tersebut dapat menilai anak binaannya.
- Uji integrasi keasramaan dan regresi PDF lulus; 17 uji navigasi lulus.
  `pnpm check` menghasilkan 0 galat dan 113 peringatan.
- Build menghasilkan keluaran aplikasi, tetapi proses kadang berhenti setelah
  adapter selesai dengan kode native Windows `3221225477`. Build terakhir belum lulus.
- Lint seluruh repositori masih gagal pada galat parser dokumen HTML dan masalah
  lama. Modul keasramaan baru tidak menghasilkan galat ESLint pada pemeriksaan terfokus.
- Server pengembangan aktif di `http://localhost:5173`; halaman login merespons
  HTTP 200 dan halaman penilaian tanpa sesi mengarahkan ke login.

## Acuan tampilan

Acuan lokal Rapkumer: `../rapkumer/src/routes/(informasi-umum)/kelas/+page.svelte`
dan `../rapkumer/src/app.css`. Dimensi piksel tabel di bawah merupakan pengukuran
Kaganga, bukan klaim ukuran persis Rapkumer.

| Elemen                  | Acuan dan ukuran                                                           | Status                                   |
| ----------------------- | -------------------------------------------------------------------------- | ---------------------------------------- |
| Struktur                | Judul `text-xl`, kartu `p-4`, jarak `gap-4`/`gap-6`, token DaisyUI         | Verified Rapkumer, sumber kelas          |
| Shell                   | Sidebar `17.5rem`, navbar `4rem`, gutter `1rem`, konten dasar `80rem`      | Verified Rapkumer, sumber CSS            |
| Shell sempit            | Navbar `3.5rem` pada lebar di bawah 640px                                  | Verified Rapkumer, sumber CSS            |
| Kontrol                 | Select/input DaisyUI, tinggi sekitar 40px                                  | Fallback Kaganga, komponen terpasang     |
| Tabel input pada 1440px | Lebar 1101.6px, header 45.8px, baris fixture 61px, padding sel 12px 16px   | Fallback Kaganga, diukur melalui browser |
| Kolom                   | Nama anak minimal `11rem`, catatan minimal `16rem`, evaluasi mengikuti isi | Fallback Kaganga                         |
| Layar sempit            | Filter bertumpuk, tabel bergulir dalam wilayah fokus tersendiri            | Fallback Kaganga, diuji melalui browser  |
| Modal                   | Memakai shell yang tersedia; tidak menambah modal baru                     | Fallback Kaganga                         |

Pada pengujian sebelum pemulihan desain, input nilai diuji pada lebar 1440, 1280, 1024, 768, 390, dan 320px tanpa overflow halaman.
Master, catatan, rekap, cetak, dan formulir murid diperiksa pada 1440 serta 320px.
Pengujian memakai database salinan dan anak fixture. Penyimpanan nilai diverifikasi
melalui pesan berhasil dan nilai yang dimuat ulang.

## Pemulihan desain menu keasramaan

Desain Kaganga sebelum perubahan dipulihkan dari sumber Git untuk Mata Pelajaran >
Keasramaan dan Input Nilai > Keasramaan, termasuk editor mata evaluasi, editor TP,
dan formulir nilai per indikator. Perubahan penggolongan asrama/semester dan batas
akses wali asuh tetap berlaku. Kontrol asrama/semester menggantikan konteks kelas.

Acuan utama: komponen lama Kaganga pada kedua route tersebut, sesuai koreksi pengguna.
Rapkumer lokal memakai struktur yang sama: kartu p-4 (16px), judul text-xl, tabel
per mata evaluasi dengan kolom No/Indikator/Aksi, serta tabel murid dengan kolom
No/Nama/Aksi/Deskripsi Nilai. Header/row mengikuti komponen lama tanpa ukuran baru.
Lebar minimum tabel murid 600px dan TP 720px bergulir pada pembungkus lokal.
Modal memakai komponen lama modal-box; tidak mengubah padding atau radius.
Dimensi ini terverifikasi dari sumber Kaganga/Rapkumer, bukan ukuran baru hasil tebakan.

Tabel asrama_evaluasi_indikator menyimpan indikator yang belum memiliki tujuan;
indikator dari tujuan asrama yang sudah ada diisi otomatis tanpa mengubah nilai.

Pemeriksaan pemulihan: uji integrasi pada database salinan lulus, termasuk kontrak
editor lama, indikator tanpa tujuan, impor Excel dengan sel lanjutan, batas anak
binaan, dan PDF. Sebanyak 17 uji navigasi lulus. Tampilan desktop 1536px memakai
kolom dan komponen lama; halaman tidak meluber. Penyimpanan matev, tujuan, dan nilai diuji
melalui browser pada data sintetis. Daftar mata evaluasi, editor TP, daftar murid,
dan formulir nilai diperiksa pada lebar 320, 768, dan 1440px tanpa overflow halaman.
Pilihan nilai tetap tampil sesudah simpan dan muat ulang. Pemeriksaan tipe menghasilkan
0 galat dan 117 peringatan. Build penuh tidak diulang untuk koreksi ini.

### Pemulihan halaman administrasi, 3 November 2026

Catatan Wali Asrama dan Rekap Nilai Keasramaan juga dipulihkan dari sumber Git
sebelum penggantian tampilan, sesuai koreksi pengguna. Acuan lokal Rapkumer:
`../rapkumer/src/routes/(input-nilai)/catatan-wali-asrama/+page.svelte` dan
`../rapkumer/src/routes/(input-nilai)/rekap-nilai-asrama/+page.svelte`.

| Elemen | Sumber dan ukuran | Status |
| --- | --- | --- |
| Kartu dan judul | `p-4`, `text-xl`, kelas komponen lama | Verified Rapkumer dan Kaganga |
| Tabel catatan | No/Nama/Catatan Wali Asrama/Aksi, minimum 720px, pembungkus bergulir | Verified Rapkumer dan Kaganga |
| Tabel rekap | Peringkat/Nama/Rata-rata Nilai Asrama, minimum kolom 80/180/210px | Verified Rapkumer dan Kaganga |
| Detail nilai | Ringkasan, matev tertinggi/terendah, tabel No/Matev/Nilai/Tujuan Dinilai | Verified Rapkumer dan Kaganga |
| Modal massal | `BulkFillModal` dan `global-modal.svelte` yang tersedia, tombol Terapkan/Batal mengikuti Catatan Wali Kelas | Fallback Kaganga, tanpa ukuran baru |

Pemilihan asrama/semester menggantikan konteks kelas; nilai tetap dihitung melalui
fungsi asrama yang sudah dipakai. Tautan detail dan kembali mempertahankan konteks.
Catatan per baris dan massal memakai transaksi serta validasi penempatan yang sama.
Satu target di luar asrama membatalkan seluruh penyimpanan massal. Riwayat tetap
hanya dapat dibaca, dan wali asuh hanya dapat melihat rekap anak binaannya.

Uji database salinan lulus, termasuk kontrak halaman lama, catatan per baris/massal,
penolakan akses lintas asrama, peringkat, detail, dan data leger. Browser membuktikan
penyimpanan per baris dan massal, serta navigasi detail/kembali dengan nilai fixture
3,00. Ketiga halaman diperiksa pada 320, 768, dan 1440px tanpa overflow halaman.
Bukti berada di `tmp/dorm-admin-ui-browser.json`, `tmp/dorm-admin-notes-restored.png`,
dan `tmp/dorm-admin-recap-restored.png`. Pemeriksaan tipe: 0 galat dan 117 peringatan.
Unduh leger melalui browser menghasilkan Excel dengan satu baris fixture, nilai 3,00,
serta label asrama/semester yang benar (`tmp/dorm-admin-ui-leger.xlsx`). Tiga uji
navigasi lulus. ESLint terfokus lulus. Build produksi tidak diulang untuk pemulihan
tampilan ini.
