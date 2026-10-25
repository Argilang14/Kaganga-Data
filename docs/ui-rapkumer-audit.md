# Audit UI Kaganga: Rapkumer First

Tanggal: 21 Oktober 2026. Skill: `kaganga-ui-design` v2 dari ZIP pengguna.

## Acuan dan Batas Perubahan

Sumber utama adalah [Rapkumer c8700c7](https://github.com/sira313/rapkumer/tree/c8700c76719cda07955e039723af3e0e5fe470d4), dibaca dari Git tanpa merge. Kaganga dan acuan sama-sama menggunakan Svelte 5, Tailwind 4, serta DaisyUI 5. Tidak memasang React, shadcn, Tabler, atau Mantine. Referensi sekunder dipakai untuk prinsip aksesibilitas dan susunan komponen, bukan mengambil alih ukuran Rapkumer.

Perubahan tidak mencakup API, database, otorisasi, isi menu, proses absensi, atau ukuran PDF. Perubahan lokal yang sudah ada tetap dipertahankan. Audit seluruh aplikasi dimulai dari inventaris sumber; pemeriksaan visual tiap halaman dilanjutkan per tahap, bukan dianggap selesai sekaligus.

Inventaris awal menemukan **106 berkas `+page.svelte`**. Tahap 1 menyentuh komponen bersama yang membungkus halaman internal. Login dan halaman tamu tidak diberi ukuran shell internal; struktur dashboard, form bisnis, dan tabel nilai/jadwal belum dinormalisasi secara menyeluruh.

## Ukuran Acuan Sebelum Implementasi

Nilai rem dihitung dengan root 16px. **Verified Rapkumer** berarti terbukti dari sumber, bukan pengukuran aplikasi Rapkumer yang sedang berjalan. Angka hasil CSS DaisyUI lokal tidak diklaim sebagai ukuran upstream yang diukur langsung.

| Elemen         | Sumber Rapkumer                                  | Acuan                                                                           | Kaganga sebelum                                                       | Keputusan tahap 1                                                           | Kepastian                                                   |
| -------------- | ------------------------------------------------ | ------------------------------------------------------------------------------- | --------------------------------------------------------------------- | --------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Sidebar        | `src/routes/+layout.svelte`                      | `w-70`: 280px, padding 16px, drawer tetap mulai 1024px                          | 288px, maksimal 85vw                                                  | 280px; batas HP dipertahankan                                               | Verified Rapkumer                                           |
| Konten         | `src/routes/+layout.svelte`                      | `max-w-7xl`: 1280px; gutter 16px                                                | batas 1600px; gutter 12/16/20px                                       | batas 1280px; gutter 12px HP, 16px lainnya                                  | Verified Rapkumer; HP Fallback Kaganga                      |
| Kolom kanan    | `src/routes/+layout.svelte`                      | tugas/favorit terpisah pada desktop lebar                                       | tugas sudah berada di navbar                                          | tetap di navbar sesuai alur Kaganga                                         | Fallback Kaganga                                            |
| Navbar         | `src/lib/components/navbar.svelte`               | DaisyUI navbar, judul 18px, tombol ikon circle                                  | judul 16/18px; tinggi minimum HP 56px                                 | tinggi stabil 56px HP / 64px lainnya; ikon 20px; target sentuh minimal 40px | Fallback Kaganga untuk tinggi eksplisit                     |
| Scroll halaman | `src/routes/+layout.svelte`                      | scroll konten internal; tinggi dihitung `100vh - 4.2/4.6rem`                    | perhitungan 4/4.6rem walau navbar bisa berbeda                        | flex mengisi sisa tinggi viewport; tidak menyalin selisih tetap             | Penyimpangan untuk memperbaiki responsivitas                |
| Menu           | `src/lib/components/menu.svelte`                 | search + expand; `details` bertingkat; area scroll desktop                      | struktur sama, label panjang belum terjaga; elemen div langsung di ul | semantik aside/nav/ul; ikon tetap; pencarian dan urutan tetap               | Verified Rapkumer untuk anatomi                             |
| Popup bersama  | `src/lib/components/global-modal.svelte`         | `sm:max-w-2xl`: 672px; `max-h-[85vh]`; judul 18px; body scroll; footer terpisah | anatomi sama; footer belum wrap; judul belum menjadi accessible name  | lebar 672px tetap; body scroll; nama dialog; footer wrap                    | Verified Rapkumer untuk ukuran/anatomi                      |
| Padding popup  | DaisyUI lokal + `global-modal.svelte`            | tidak ditetapkan upstream, mengikuti tema                                       | 24px desktop / 16px HP dari CSS lokal                                 | pertahankan 24/16px, radius 8px                                             | Fallback Kaganga                                            |
| Tabel murid    | `src/routes/(informasi-umum)/murid/+page.svelte` | `.table`, overflow lokal; nama 45%; No 50px/min40px                             | sama; CSS HP 13px, padding 10.4x12px                                  | jangan paksa semua tabel menjadi satu ukuran                                | Verified Rapkumer untuk struktur; tinggi baris belum diukur |
| Form/tombol    | halaman murid, `navbar.svelte`                   | `.input`, `.btn`, aksi baris `.btn-sm`                                          | DaisyUI yang sama; ukuran khusus beberapa halaman                     | pertahankan dulu; ukur per keluarga halaman tahap 2                         | Tinggi bergantung CSS/konten; belum diukur upstream         |
| Panel data     | halaman murid                                    | radius 8px, padding 16px, judul 20px, shadow-md                                 | banyak halaman serupa, sebagian CSS khusus                            | tidak mengubah seluruh `.card` secara global                                | Verified Rapkumer                                           |

## Temuan dan Prioritas

1. `navbar.svelte`: popup tugas memakai posisi absolute terhadap tombol, sehingga sisi kiri dapat keluar viewport HP. Posisi HP perlu mengikuti viewport.
2. `app.css` / `+layout.svelte`: tinggi navbar dan pengurangan tinggi konten tidak konsisten; satu sumber ukuran dan flex layout menghindari ruang berlebih.
3. `+layout.svelte` / `menu.svelte`: sidebar mengandung div langsung di dalam ul; heading dan pencarian perlu dipisahkan dari daftar menu. Perbaiki struktur tanpa mengubah filter izin.
4. `global-modal.svelte`: dialog belum terhubung ke judul, tombol footer bisa meluber, dan area scroll bertumpuk. Perbaiki pada komponen bersama, pertahankan callback dan perilaku dismiss.
5. Ukuran judul, filter, table density, empty state, dan popup khusus belum seragam antarmodul. Hindari selector global yang menimpa tabel jadwal/nilai/cetak.

### Pemeriksaan Sampel Modul

| Modul / sumber                                        | Hasil pemeriksaan awal                                                                                      | Penanganan lanjutan                                                                                                            |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Murid dan pegawai (`src/routes/(informasi-umum)/...`) | Panel p-4, radius 8px, judul 20px sudah dekat acuan; form pegawai memakai popup 4xl/5xl untuk banyak bidang | Pertahankan ukuran berdasarkan kebutuhan isi; seragamkan label, filter dan footer, bukan mempersempit semua form menjadi 672px |
| `absensi/ActivitySettings.svelte`                     | Popup khusus 2xl, tinggi 90dvh, padding di bagian dalam                                                     | Audit fokus, footer dan jarak kolom pada tahap absensi; tidak ditimpa aturan popup bersama                                     |
| `absensi/ClassMonitoring.svelte`                      | Lebar tabel `164 + jumlah pertemuan * 288px`, sel pertemuan khusus dan breakpoint sendiri                   | Pertahankan scroll horizontal serta status pertemuan; jangan memaksa tabel ke lebar viewport                                   |
| `pengguna/AddUserModal.svelte`                        | Form khusus maksimum 4xl, tinggi 92vh                                                                       | Uji multi-mapel/kelas dan nama panjang pada tahap pengguna                                                                     |
| `src/routes/persetujuan/+page.svelte`                 | Modal `div.modal-open`, kelas form lama seperti `form-control`/`label-text`, judul 24px                     | Kandidat migrasi presentasi ke dialog native dan label eksplisit; kontrak form/status persetujuan tetap                        |
| `src/routes/inventaris/+page.svelte`                  | Filter grid kolom angka tetap dan judul 24px, berbeda dari master data 20px                                 | Selaraskan header dan grid filter; uji nama aset panjang sebelum menetapkan lebar                                              |

Daftar ini adalah audit sumber dan sampel, bukan klaim bahwa seluruh popup khusus sudah diuji secara visual.

## Tahapan

- [x] Membaca skill, meninjau stack, mengunci commit acuan, membandingkan komponen bersama, dan mencatat ukuran.
- [x] Tahap 1: fondasi shell, sidebar, navbar, dan popup bersama; QA screenshot sebelum/sesudah.
- [ ] Tahap 2: data master (murid, arsip, pegawai, kelas, sekolah, satuan pendidikan), form dan tabelnya.
- [ ] Tahap 3: seluruh absensi (scan, catat, monitoring, rekap, kelas, konfirmasi pulang, pengaturan); pertahankan indikator dan akses role.
- [ ] Tahap 4: kurikulum, jadwal, jurnal, mata pelajaran dan input nilai; uji tabel lebar serta modal edit.
- [ ] Tahap 5: surat, persetujuan, berkas, inventaris, komunikasi dan portal.
- [ ] Tahap 6: dashboard, pengguna/pengaturan, halaman publik, toolbar cetak/preview; QA lintas modul dan role. Template PDF tetap di luar perubahan visual global.

## Verifikasi

Ukuran target: 1440, 1024, 768, 390, 320px; tambahan desktop 1920px dan landscape pendek. Gunakan database salinan dan sesi QA, bukan mengubah data sekolah. Rekam ukuran aktual, screenshot, overflow, fokus, drawer, dropdown, dialog, loading/empty/error. Build/typecheck dan uji UI dijalankan setelah implementasi. Status dan lokasi hasil akan diisi sesuai hasil nyata.

### Baseline Kaganga Terukur

Database salinan; build sebelum perubahan fondasi. Bukti lokal di `tmp/ui-foundation-Isb7Bl/`: 18 screenshot dan `measurements.json`. Angka ini **Measured Kaganga**, bukan pengukuran Rapkumer yang berjalan.

| Viewport | Lebar konten | Header tabel murid | Baris murid pertama | Input pencarian | Sisi kiri popup tugas |
| -------- | ------------ | ------------------ | ------------------- | --------------- | --------------------- |
| 1920x900 | 1582px       | 49.5px             | 57px                | 40px            | 1309.39px             |
| 1440x900 | 1102px       | 49.5px             | 57px                | 40px            | 829.39px              |
| 1024x900 | 694px        | 49.5px             | 57px                | 40px            | 413.39px              |
| 768x900  | 734px        | 49.5px             | 57px                | 40px            | 157.39px              |
| 390x900  | 366px        | 46.28px            | 53.78px             | 40px            | -99.80px (terpotong)  |
| 320x900  | 296px        | 46.28px            | 53.78px             | 40px            | -105.39px (terpotong) |

Tinggi baris dapat bertambah ketika nama membungkus. Tahap berikutnya harus menjaga keterbacaan nama, bukan memaksa tinggi baris tetap.

Referensi pelengkap: [shadcn Dialog](https://ui.shadcn.com/docs/components/base/dialog), [Tabler Layout](https://docs.tabler.io/ui/layout), [Mantine Modal](https://mantine.dev/core/modal/), [Web Interface Guidelines](https://github.com/vercel-labs/web-interface-guidelines/blob/main/command.md). Tidak ada komponen framework lain yang diimpor.

### Hasil Tahap 1

- Token layar terpusat pada `src/app.css`, hanya dalam media screen; lebar sidebar 280px, batas konten 1280px, navbar 64px / 56px pada HP. Target baris menu 40px dipilih untuk keterbacaan dan interaksi (Fallback Kaganga), bukan dianggap ukuran upstream yang terukur.
- Tinggi area kerja mengisi viewport dengan flex; tidak lagi bergantung pada pengurangan tinggi navbar yang berbeda-beda. Footer sidebar tetap dapat diakses ketika daftar menu panjang.
- Menu aktif memakai aksen tema dan `aria-current`; struktur aside/nav/ul dibenahi tanpa perubahan isi menu atau filter izin. Drawer tertutup setelah navigasi internal, termasuk tautan pengaturan.
- Popup tugas mengikuti viewport pada HP/tablet. Pada lebar 390px, sisi kiri/kanan menjadi 9px / 381px; pada 320px menjadi 9px / 311px. Sebelumnya sisi kiri bernilai negatif. Popup dan pilihan kelas tidak keluar layar pada enam ukuran uji.
- Dialog bersama memiliki accessible name, body scroll, footer wrap, dan pengembalian fokus ke tombol pembuka. Callback simpan/batal dan aturan backdrop tetap. Garis fokus pencarian tidak bertumpuk.
- Tidak mengubah paket/dependensi, versi aplikasi, database/schema, otorisasi, atau template PDF. Tidak membuat commit, push, maupun rilis.

### Hasil Pengujian

Perintah yang dijalankan:

```sh
pnpm check
pnpm build
pnpm exec eslint src/routes/+layout.svelte src/lib/components/menu.svelte src/lib/components/navbar.svelte src/lib/components/global-modal.svelte scripts/test-ui-foundation-copy.mjs
node --test src/lib/role-menu-access.test.ts src/lib/user-role.test.ts src/lib/attendance-scan.test.ts
node scripts/test-ui-foundation-copy.mjs --baseline
node scripts/test-ui-foundation-copy.mjs
```

Hasil: build lulus; typecheck 0 error, 116 peringatan pada 35 berkas lain; lint berkas terkait dan format lulus; 19 uji regresi lulus. Tidak melakukan format/refactor seluruh repositori untuk menghilangkan peringatan lama.

QA akhir: `tmp/ui-foundation-o6vtwF/` berisi screenshot dan `measurements.json`. Delapan halaman (`/`, `/murid`, `/pegawai`, pengaturan kegiatan, monitoring kelas, rekap kegiatan, `/pengguna`, `/cetak-sr`) diuji pada 1920, 1440, 1024, 768, 390, 320px, tinggi 900px: **48 kombinasi halaman/ukuran**. Tidak ditemukan overflow dokumen atau runtime error browser. Konten desktop 1920px dibatasi tepat 1280px. Scroll halaman berakhir di dalam viewport.

Interaksi tambahan pada salinan database: pencarian menu kosong, drawer dan navigasi, popup tugas + Escape, dropdown kelas, nama dialog, fokus awal/kembali, popup bantuan pada 390x600 dan 768x480, mode gelap melalui tombol sebenarnya, serta loading/error tugas dengan respons jaringan simulasi. Screenshot desktop, HP, menu kelas, dialog pendek, fokus pencarian dan mode gelap diperiksa langsung.

Server lokal: `http://127.0.0.1:5152`, halaman login HTTP 200 dan listener terverifikasi. Ini bukan pembaruan installer PC sekolah.

### Batas Verifikasi dan Tahap Berikutnya

Pengujian menggunakan Chrome headless dengan viewport responsif dan akun admin QA. Belum diuji pada perangkat fisik/iPad/Safari, seluruh tampilan tiap role, seluruh 106 halaman, atau seluruh popup khusus. Regresi role/menu dilakukan melalui unit test; data QA dan mutasi fixture hanya pada database salinan. Tahap berikutnya adalah form/tabel data master, kemudian seluruh absensi. Keadaan sukses/validasi form bisnis dan perlindungan isian belum tersimpan harus diuji pada tahap modul masing-masing.
