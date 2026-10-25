# Audit ukuran Data Murid dan Data Pegawai

Tanggal: 25 Oktober 2026.

## Cakupan dan acuan

Halaman yang diperiksa langsung: `http://localhost:5152/murid` dan `http://localhost:5152/pegawai`.

Data Murid menjadi acuan visual sesuai permintaan pengguna. Semua angka di bawah adalah **ukuran Kaganga lokal yang terukur**, bukan klaim ukuran persis Rapkumer upstream. Pemeriksaan mengikuti skill `kaganga-ui-design` dan `kaganga-ui`.

Chrome otomatis memakai tema light, font dasar 16 px, deviceScaleFactor 1, pada viewport 1440x1000, 1280x900, 768x1024, dan 390x844. Satuan adalah CSS px; zoom browser atau skala Windows pada perangkat pengguna dapat membuat ukuran fisik terlihat berbeda.

31 keadaan halaman/popup diukur, termasuk keadaan kelas kosong yang ditemukan saat pertama membuka Data Murid. Untuk mengukur baris berisi data, pemilih konteks diarahkan melalui tautan kelas yang tersedia ke kelas berisi murid. Ini bukan perubahan data murid.

Tidak menekan Simpan, Hapus, Arsipkan pada konfirmasi, impor, unggah, atau perubahan status. Pengaman browser hanya mengizinkan GET/HEAD dan POST login. Tidak ada permintaan mutasi lain yang dicoba selama audit. Login membuat sesi autentikasi normal.

## Temuan yang diprioritaskan

### P2: Tab Catatan terpotong pada formulir pegawai di HP

Pada viewport 390x844, pembungkus tab setinggi 53,78 px memiliki isi setinggi 76 px. Tab Catatan membungkus ke baris berikutnya dan sebagian tertutup. Screenshot mengonfirmasi potongan label di bawah baris tab pertama.

Sumber: `src/routes/(informasi-umum)/pegawai/+page.svelte:614` dan aturan overflow tab di `src/app.css:235`.

Usulan: cegah tab menyusut dalam susunan flex popup. Pilih tab satu baris yang dapat digeser atau tab membungkus dengan tinggi utuh. Jangan mengatasi dengan menyembunyikan tab.

### P2: Daftar pegawai terlalu jauh dari bagian awal pada HP

Header tabel Pegawai mulai pada posisi y sekitar 1114 px, sedangkan Murid sekitar 380 px. Ini koordinat saat halaman berada di posisi awal, bukan jumlah gulir yang selalu diperlukan pada semua perangkat. Ringkasan empat bagian bertumpuk, keterangan panjang, filter, dan toolbar menambah tinggi sebelum daftar.

Sumber: `src/routes/(informasi-umum)/pegawai/+page.svelte:291` sampai bagian tabel pada baris 418.

Usulan: ringkasan dua kolom pada HP, jarak vertikal lebih ringkas, dan filter sekunder dapat diringkas. Pertahankan fungsi pencarian serta jenis/status pegawai.

### P2: Foto detail pegawai mendominasi tampilan HP

Pada detail pegawai 390x844, foto/placeholder memakai lebar kolom penuh dengan rasio 3:4. Sebagian besar area baca awal diisi foto, sementara biodata berada di bawah. Tombol bawah tetap terlihat, tetapi informasi utama memerlukan gulir.

Sumber: `src/lib/components/pegawai/DetailPegawai.svelte:271` dan baris 274.

Usulan: batasi foto pada HP dan letakkan ringkasan identitas di samping atau di bawahnya. Foto tidak perlu menyamai lebar bidang formulir.

### P2: Nama aksesibel dialog belum dinyatakan

Dialog tambah/edit dan detail yang diperiksa tidak memiliki `aria-label` atau hubungan `aria-labelledby` ke judul. Pada pengukuran, formulir pegawai terbuka melalui native `showModal()`, sedangkan detail pegawai dan modal rute murid memakai atribut `open` dan tidak masuk top layer native.

Sumber: `src/routes/(informasi-umum)/pegawai/+page.svelte:595`, baris 606, dan `src/lib/components/murid/modals.svelte:53`.

Usulan: saat merapikan Pegawai, beri judul aksesibel dan verifikasi fokus, Escape, serta pengembalian fokus ke pemicu. Jangan menyalin kekurangan perilaku modal hanya untuk menyamai tampilan Murid. Audit ini belum menguji siklus keyboard secara menyeluruh.

## Ukuran desktop 1440x1000

| Komponen | Data Murid | Data Pegawai | Catatan |
| --- | --- | --- | --- |
| Sidebar | 280 px | 280 px | Shell yang sama |
| Navbar | 64 px | 64 px | Shell yang sama |
| Lebar permukaan halaman | 1103 px | 1103 px | Mengikuti ruang konten yang tersedia |
| Padding permukaan | 16 px | 16 px | Sudah sama |
| Radius permukaan | 8 px | 8 px | Sudah sama |
| Judul halaman | 20 px, bold | 20 px, bold | Sudah sama |
| Tombol tambah | Tinggi 40 px | Tinggi 40 px | Lebar mengikuti teks |
| Tombol panah menu | 48x40 px | 48x40 px | Sudah sama |
| Menu dropdown | Lebar 200 px; padding 8 px | Lebar 224 px; padding 8 px | Jumlah item berbeda |
| Input/select formulir | Tinggi 40 px | Tinggi 40 px | Sudah sama |
| Font input/tombol utama | 14 px | 14 px | Sudah sama |
| Tinggi header tabel | 49,5 px | 49,5 px | Sudah sama |
| Tinggi baris berisi data | 57 px pada sampel | 72 px pada sampel | Pegawai menetapkan `h-[72px]` dan menampilkan NIP di bawah nama |
| Padding sel tabel | Vertikal 12 px; horizontal 16 px | Vertikal 12 px; horizontal 16 px | Sudah sama |
| Font isi tabel | 14 px | 14 px | Sudah sama |
| Checkbox | 24x24 px | 24x24 px | Sudah sama |
| Tombol aksi tabel | Tinggi 32 px, lebar sekitar 38 px | Tinggi 32 px, lebar sekitar 37-38 px | Pegawai mempunyai tiga aksi, Murid dua |
| Lebar tabel | 1071 px | 1069 px | Selisih dari border/pembungkus, bukan masalah utama |
| Kolom nama | Sekitar 481 px | Sekitar 363 px | Murid memakai alokasi 45%; Pegawai 34% |
| Posisi awal tabel | y 295 px | y 482,5 px | Pegawai mempunyai ringkasan, filter, dan toolbar tambahan |

Pada daftar Murid kosong, baris pesan berukuran 77 px. Angka ini tidak dipakai sebagai acuan kepadatan baris data.

## Ukuran popup desktop

Lebar adalah hasil render aktual, bukan hanya nilai class. Tinggi mengikuti isi dan konteks saat pemeriksaan; jangan dipakai sebagai tinggi tetap.

| Popup | Lebar x tinggi terukur | Padding | Radius |
| --- | --- | --- | --- |
| Tambah Murid | 672x656 px | 16 px | 8 px |
| Edit Murid | 672x656 px | 16 px | 8 px |
| Detail Murid | 672x594 px | 16 px | 8 px |
| Foto Murid | 512x420 px | 24 px | Mengikuti modal bawaan |
| Unggah foto massal Murid | 448x519 px | 24 px | Mengikuti modal bawaan |
| Konfirmasi arsip Murid | 512x272 px | 24 px | Mengikuti modal bawaan |
| Tambah Pegawai | 896x714 px | 20 px | 8 px |
| Edit Pegawai | 896x714 px | 20 px | 8 px |
| Detail Pegawai | 1024x562 px | 20 px | 8 px |
| Impor Pegawai sebelum memilih file | 1024x300 px | 24 px | Mengikuti modal bawaan |

Formulir dan detail Murid memakai `sm:max-w-2xl` dan `p-4`. Formulir Pegawai memakai `max-w-4xl`, sedangkan detail dan impor memakai `max-w-5xl`.

Data Murid memiliki enam tab formulir. Pegawai memiliki empat tab formulir dan delapan tab detail, termasuk penugasan, pendidikan, sertifikasi, dokumen, dan riwayat. Perbedaan isi ini perlu dipertahankan saat menyeragamkan ukuran.

## Responsif

| Viewport | Lebar permukaan | Lebar tabel Murid / Pegawai | Lebar popup tambah Murid / Pegawai |
| --- | --- | --- | --- |
| 1440x1000 | 1103 px | 1071 / 1069 px | 672 / 896 px |
| 1280x900 | 943 px | 911 / 909 px | 672 / 896 px |
| 768x1024 | 719 px | 687 / 880 px | 672 / 704 px |
| 390x844 | 351 px | Sekitar 586 / 880 px | 374 / 374 px |

Pada HP:

- Navbar 56 px; gutter halaman 12 px.
- Popup memiliki margin samping 8 px, padding 16 px, dan radius 8 px.
- Batas maksimum tinggi popup terukur 828 px pada viewport setinggi 844 px.
- Tinggi aktual popup tambah Murid sekitar 742 px; Pegawai 828 px.
- Tinggi aktual popup detail Murid sekitar 702 px; Pegawai sekitar 772 px; impor Pegawai 332 px.
- Font tabel turun menjadi 13 px; padding sel menjadi sekitar 10,4 px vertikal dan 12 px horizontal.
- Tabel Pegawai tetap berukuran minimum 880 px pada wadah sekitar 317 px. Gulir horizontal tertahan di wadah tabel, tidak membuat seluruh halaman melebar.
- Lebar dokumen tetap sama dengan viewport pada empat ukuran layar. Tidak ditemukan luapan horizontal halaman pada keadaan yang diukur.

## Acuan perapihan Pegawai yang diusulkan

Ini rancangan tindak lanjut, belum implementasi:

1. Pertahankan judul 20 px, font tabel/input 14 px, kontrol utama 40 px, aksi tabel 32 px, padding permukaan 16 px, dan radius 8 px.
2. Ringkas ringkasan statistik dan filter, terutama pada HP. Jangan menghilangkan kebutuhan operasional atau mengubah arti jumlah pegawai.
3. Gunakan tinggi baris yang mengikuti isi. Sasaran awal sekitar 60-64 px untuk nama dan NIP dua baris; uji nama panjang sebelum menetapkan ukuran. Jangan memaksa 57 px jika membuat teks bertabrakan.
4. Gunakan popup standar sekitar 672 px sebagai kandidat untuk formulir biodata, dengan dua kolom pada ruang cukup dan satu kolom di HP. Detail kompleks atau pratinjau impor boleh mendapat pengecualian lebih lebar jika pengujian menunjukkan kebutuhan nyata.
5. Samakan padding, judul, tab, area gulir, dan tombol bawah popup. Pastikan tab Catatan terlihat utuh pada HP serta input tidak tertutup tombol bawah.
6. Pertahankan identitas utama saat tabel digeser di layar kecil; evaluasi lebar kolom, pembungkusan teks, dan letak aksi tanpa menghilangkan akses ke NIP, jenis, jabatan, atau status.
7. Kurangi dominasi foto pada detail HP. Pertahankan seluruh tab penugasan, pendidikan, sertifikasi, dokumen, dan riwayat.
8. Uji kembali desktop, laptop, tablet, HP, keyboard, nama panjang, kosong, loading, dan galat menggunakan data salinan untuk tindakan simpan. Perubahan UI tidak boleh mengubah API, role, schema, atau kontrak formulir.

## Bukti dan batas verifikasi

Pengukuran dan screenshot lokal:

- `tmp/ui-murid-pegawai-audit-2026-10-25/measurements.json`
- `tmp/ui-murid-pegawai-audit-2026-10-25-extra/measurements.json`
- Screenshot pada kedua direktori tersebut. Bagian tabel dan beberapa identitas disamarkan untuk pemeriksaan visual; bukti tetap bersifat lokal.
- Skrip audit: `tmp/audit-murid-pegawai-ui.mjs`.

Tidak ada galat JavaScript pada penelusuran yang direkam. Pemeriksaan ini tidak menguji simpan, validasi setelah submit, unggah, penghapusan, backend izin, tema gelap, keyboard virtual HP, maupun seluruh variasi data panjang. Build/lint tidak dijalankan karena tidak ada perubahan kode aplikasi.

Panduan aksesibilitas pendukung: https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md. Data Murid lokal tetap menjadi acuan ukuran utama untuk tugas ini.

Status audit awal: selesai tanpa perubahan aplikasi. Implementasi berikutnya dicatat di bawah; tidak ada commit, push, perubahan versi, atau rilis.

## Implementasi Data Pegawai

Dilaksanakan pada 25 Oktober 2026 setelah pengguna meminta server dihidupkan dan UI Pegawai dirapikan menggunakan Data Murid sebagai acuan.

Acuan dimensi tetap **Fallback Kaganga, diukur dari Data Murid lokal**, bukan klaim pengukuran Rapkumer upstream. Sumber utama adalah `src/routes/(informasi-umum)/murid/+page.svelte`, komponen modal Murid, dan ukuran bersama di `src/app.css`. Tidak ada perubahan pada halaman Murid atau CSS bersama dalam implementasi ini.

| Bagian | Pegawai sebelum | Pegawai sesudah | Dasar penyesuaian |
|---|---|---|---|
| Baris tabel desktop | 72 px | 60 px pada data yang diperiksa | Mengikuti isi nama dan NIP; Murid 57 px |
| Header tabel desktop | 49,5 px | 49,5 px | Sama dengan Murid |
| Awal tabel desktop 1440x1000 | y 482,5 px | y 321 px | Ringkasan dan filter diringkas |
| Awal tabel HP 390x844 | y 1114 px | y 585 px | Ringkasan dua kolom dan toolbar seleksi bersyarat |
| Lebar minimum tabel | 880 px | 760 px | Seluruh tujuh kolom dipertahankan; gulir horizontal lokal |
| Popup tambah/edit desktop | 896 px, padding 20 px | 672 px, padding 16 px | Lebar dan padding Murid |
| Popup detail desktop | 1024 px, padding 20 px | 672 px, padding 16 px | Lebar dan padding Murid |
| Popup impor awal desktop | 1024 px, padding 24 px | 672 px, padding 16 px | Pratinjau berisi data boleh melebar sampai 896 px |
| Tab formulir HP | Tinggi 53,78 px, isi 76 px terpotong | Tinggi 40 px, gulir horizontal | Label tidak menyusut atau turun baris |
| Foto detail HP | Lebar sekitar 300 px | Lebar 144 px, tinggi 192 px | Identitas tidak terdorong sejauh sebelumnya |

Ringkasan menggunakan warna tema DaisyUI yang sudah tersedia. Filter, status, pagination, Excel, pemilihan massal, detail, serta seluruh tab dan isian pegawai dipertahankan. Tombol aksi foto memakai ikon dengan nama aksesibel dan tooltip bawaan browser. Formulir memiliki judul, hubungan tab-panel, navigasi panah/Home/End, area isi bergulir, dan footer terpisah. Detail menggunakan dialog modal native agar fokus tetap berada di popup; popup foto tetap dapat dibuka di atasnya.

Berkas aplikasi yang disentuh hanya:

- `src/routes/(informasi-umum)/pegawai/+page.svelte`
- `src/lib/components/pegawai/DetailPegawai.svelte`

Perubahan sebelumnya pada `DetailPegawai.svelte` dipertahankan. Beberapa blok opsi ditambahkan key stabil dan satu fungsi edit yang tidak pernah digunakan dihapus agar lint terfokus lulus. Tidak ada perubahan schema, API, hak akses, atau kontrak penyimpanan.

### Verifikasi implementasi

- Build produksi beserta adapter Node berhasil.
- Pemeriksaan Svelte: 0 error, 116 peringatan yang berada di luar dua berkas UI ini.
- ESLint dua berkas: lulus. Kompilasi Svelte kedua komponen tidak menghasilkan peringatan.
- Sebelas pengujian fondasi pegawai, Excel, dan dokumen: lulus.
- Perbandingan atribut `name`, `action`, dan `formaction` terhadap salinan sebelum edit: tetap sama. Pemeriksaan ini melengkapi, bukan menggantikan, pengujian simpan.
- Sebanyak 45 pemeriksaan browser lulus: seleksi baris, delapan tab detail, modal foto bertingkat, perpindahan detail ke edit tanpa kehilangan nama, keyboard tab, filter kosong, batas popup, dan ukuran layar 1440, 1280, 768, 390, serta 320 px.
- Screenshot sebelum/sesudah pada desktop, laptop, tablet, dan HP; tema gelap diperiksa pada 1440 dan 390 px. Tidak ada galat JavaScript atau percobaan mutasi data dalam pemeriksaan UI selain login yang diizinkan.
- Pengujian visual dan interaksi tidak melakukan simpan, hapus, impor, unggah foto/dokumen, atau mengubah penugasan. Pratinjau impor yang sudah berisi data, keyboard virtual perangkat fisik, dan seluruh variasi teks panjang belum diverifikasi langsung.

Bukti sesudah implementasi berada di `tmp/ui-pegawai-after-2026-10-25/`, `tmp/ui-pegawai-after-2026-10-25-extra/`, dan `tmp/ui-pegawai-interactions-2026-10-25/`. Bukti lokal dapat memuat identitas dan tidak dimaksudkan untuk dipublikasikan.

### Server lokal

Vite pengembangan mengalami permintaan yang menggantung, termasuk pada endpoint klien Vite. Menjalankan ulang proses dan optimasi cache belum memulihkannya; penyebab pastinya belum dipastikan. Tidak ada perubahan konfigurasi Vite atau dependensi untuk mengatasinya dalam tugas UI ini.

Server akhirnya dijalankan dari build terbaru melalui `scripts/start-build.mjs`, dengan port 5152 dan host `0.0.0.0`, sebagai proses tersembunyi. HTTP `/login` mengembalikan 200 dan listener port diverifikasi. Mode ini tidak menyediakan hot reload; perubahan kode berikutnya memerlukan build dan restart atau pemulihan server pengembangan.

Status implementasi: selesai lokal. Tidak ada installer, commit, push, atau rilis baru.
