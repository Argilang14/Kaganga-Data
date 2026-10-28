# Login School Identity

## Audit sebelum implementasi

Kaganga memakai SvelteKit 2, Svelte 5, Tailwind 4, DaisyUI 5, ikon lokal,
dan SQLite/Drizzle. Instruksi `AGENTS.md` dibaca. Tidak diperlukan dependensi baru.

Sumber yang diperiksa:

- `src/routes/login/+page.svelte`: card login, username/password, toggle sandi,
  dan `FormEnhance` dengan aksi `?/login`.
- `src/routes/login/+page.server.ts`: normalisasi nama pengguna, autentikasi,
  pembatasan percobaan, pembuatan sesi, cookie sekolah/kelas, redirect internal,
  dan kewajiban mengganti sandi akun baru.
- `src/lib/server/auth.ts`: scrypt, sesi 12 jam, refresh 2 jam sebelum kedaluwarsa,
  cookie sesi HttpOnly/SameSite=Lax; tidak ada opsi sesi persisten.
- `src/hooks.server.ts`: CSRF, session resolution, sekolah, role/menu/absensi.
- `src/lib/components/form-enhance.svelte`: pola formulir Rapkumer. Kaganga belum
  mempunyai callback kegagalan inline yang sudah ada di referensi Rapkumer.
- `src/routes/+layout.svelte`: login dan buku tamu memakai wrapper yang sama.
  Penyesuaian wrapper harus khusus cabang login agar buku tamu tetap sama.
- `src/lib/components/dashboard/sekolah-overview-card.svelte` dan `src/app.css`:
  ikon lokal, identitas sekolah, font bawaan, token jarak serta bentuk komponen.

Role dan permission tetap ditentukan server. Tidak ada selector role, fitur
Ingat saya, atau tautan pemulihan sandi baru. Endpoint, sesi, CSRF, pembatasan
percobaan, dan aksi login tidak diganti.

## Acuan dan ukuran

Referensi Rapkumer adalah kode lokal `origin/main` pada
`1df6d3593d689466f3549f11a3130180652cf888`, bukan klaim versi GitHub terbaru.
Mockup pengguna menjadi acuan komposisi School Identity.

| Elemen              | Acuan                                    | Ukuran/pola                                                           | Kepastian                                                        |
| ------------------- | ---------------------------------------- | --------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Login dasar         | Rapkumer `src/routes/login/+page.svelte` | `card`, `max-w-md`, heading `text-2xl`, label terlihat, `FormEnhance` | Verified Rapkumer                                                |
| Form                | Rapkumer `form-enhance.svelte`           | POST `?/login`, callback kegagalan, state submitting/invalid          | Verified Rapkumer                                                |
| Ikon                | Kaganga `icon.svelte`                    | Ikon lokal, tanpa pustaka tambahan                                    | Fallback Kaganga                                                 |
| Kontainer baru      | Prompt pengguna                          | Maksimum 1200px, desktop 45:55                                        | Fallback Kaganga, override khusus login atas permintaan pengguna |
| Form baru           | Prompt pengguna                          | Maksimum 520px; input/tombol 48px                                     | Fallback Kaganga, override khusus login                          |
| Radius              | Prompt pengguna                          | Panel 20px, card 16px, kontrol 12px                                   | Fallback Kaganga, override khusus login                          |
| Tipografi           | Font global aplikasi                     | Tanpa unduhan font eksternal; tidak memakai skala vw/zoom             | Fallback Kaganga                                                 |
| Sidebar/tabel/popup | Tidak ada di login                       | Tidak berlaku; modul lain tidak didesain ulang                        | Tidak berlaku                                                    |

## Aset dan batas data publik

Foto drone disediakan pengguna: `school-login-background.jpg.jpeg`.
Foto dipakai sebagai dokumentasi sekolah sebenarnya, bukan gedung dari mockup.
Ornamen Rafflesia bersifat dekoratif, bukan logo atau lambang resmi sekolah.
Logo mengikuti cookie sekolah aktif; browser baru memakai sekolah pertama,
sesuai pola fallback aplikasi. Cookie yang tidak valid juga kembali ke fallback.
Loader hanya mengirim nama dan gambar logo untuk tampilan publik, tanpa kontak,
identitas pegawai, NPSN, akun, atau perubahan hak akses. Rute logo terlindungi
tidak dibuka untuk publik.

Token navy/biru/sky mengikuti prompt dan dibatasi pada halaman login. Tampilan
login tetap terang seperti mockup, tanpa mengubah preferensi tema pengguna di
dashboard. FormEnhance hanya mendapat opsi tambahan; perilaku lama tetap default.

## Implementasi

- `src/routes/login/+page.svelte`: komposisi login dan token CSS khusus halaman.
- `src/lib/components/login/school-brand-panel.svelte`: foto, branding, ornamen.
- `src/lib/components/login/login-form.svelte`: logo sekolah aktif, formulir,
  sandi terlihat/tersembunyi, error inline, fokus, loading, footer.
- `src/routes/login/+page.server.ts`: loader branding publik saja; aksi login
  tidak berubah selain formatting.
- `src/lib/components/form-enhance.svelte`: callback failure/error dan opsi
  pencegahan submit ganda, semuanya opt-in. Default modul lain tetap sama.
- `src/routes/+layout.svelte`: hanya login dilepaskan dari wrapper lama.
  Cabang buku tamu dipertahankan.
- `static/login/school-drone.jpg`: salinan foto pengguna, 399388 byte.
- `static/login/rafflesia.webp`: ornamen bitmap dekoratif buatan imagegen,
  putih transparan, dioptimalkan menjadi 384x384, 49298 byte. Bukan lambang resmi.
- `scripts/qa-login-ui-copy.mjs`: uji browser dan autentikasi pada salinan SQLite.

Arahan ornamen: satu Rafflesia arnoldii dengan lima lobus, detail botanical line
engraving putih, transparan, tanpa teks/logo/gedung. Tidak ada foto sekolah
fiktif, dependency tambahan, perubahan schema, atau mekanisme otorisasi baru.

## Hasil Ukur Browser

Chrome headless pada CSS viewport; semua ukuran berikut hasil pengukuran,
bukan klaim ukuran Rapkumer.

| Lebar layar | Lebar card | Tinggi input | Tinggi tombol | Overflow horizontal |
| ----------- | ---------- | ------------ | ------------- | ------------------- |
| 1440px      | 520px      | 48px         | 48px          | Tidak               |
| 1024px      | 488.81px   | 48px         | 48px          | Tidak               |
| 768px       | 416.33px   | 48px         | 48px          | Tidak               |
| 390px       | 358px      | 48px         | 48px          | Tidak               |
| 360px       | 328px      | 48px         | 48px          | Tidak               |
| 320px       | 288px      | 48px         | 48px          | Tidak               |

Desktop 1440: layout 1200px, panel identitas 540px, radius luar 20px,
card 16px, kontrol 12px. Landscape 844x390 juga dapat digulir tanpa overflow
horizontal. Halaman kontrol Pengasuhan sebelum/sesudah tetap 1071px dengan
font 16px. Screenshot kontrol diperiksa; tanggal berganti karena pengujian
melewati tengah malam, bukan perubahan styling.

## Verifikasi

- `pnpm build`: berhasil.
- `pnpm check`: 0 error, 117 warning di 36 file lama; tidak ada warning login.
- ESLint terarah dan Prettier file tersentuh: bersih.
- `pnpm lint`: belum lolos pada keseluruhan repository. Prettier menemukan
  syntax HTML lama di `docs/keasramaan.html` dan `docs/rapor.html`, serta banyak
  perbedaan formatting file lain. Tidak dilakukan pemformatan massal.
- `node scripts/qa-login-ui-copy.mjs`: 16 kelompok uji berhasil pada salinan
  database, termasuk ukuran layar, pergantian logo sekolah, fallback cookie
  tidak valid, MIME logo aman, data sekolah privat tidak dikirim, input kosong,
  CSRF, error generik akun, rate limit, sesi HttpOnly/SameSite=Lax, redirect,
  role tidak bisa dinaikkan lewat POST, wajib ganti sandi, sandi lama pendek,
  navigasi keyboard, toggle sandi, loading, submit ganda, dan koneksi putus.
- Preferensi dark mode tidak dihapus; halaman login saja menggunakan light.
- Server lokal 5152 dimuat ulang. Login dan kedua aset merespons HTTP 200.

Artefak sebelum: `tmp/login-ui-before-1793120366659/`.
Artefak akhir: `tmp/login-ui-after-1793121510691/`, meliputi enam screenshot,
error/loading/dark/landscape, hasil JSON, dan pengukuran.

Penyesuaian mockup: memakai foto drone asli dan logo database, bukan gedung
atau emblem ilustratif; tidak ada role selector, remember me, atau reset sandi
karena alurnya belum tersedia. Font mengikuti aplikasi, bukan font eksternal.

Pemeriksaan manual tersisa: browser HP/iPad asli (termasuk keyboard virtual,
autofill dan screen reader), akses melalui domain produksi, serta hasil logo
aktif di PC server sekolah setelah paket pembaruan dipasang. Pengujian ini
tidak menerbitkan rilis atau mengubah data produksi PC sekolah.
