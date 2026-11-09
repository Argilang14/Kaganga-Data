# Kelompok pilihan Cetak Dokumen

Permintaan: mempermudah pencarian dokumen dalam pemilih Cetak → Cetak Dokumen.

| Kelompok         | Dokumen                                                             |
| ---------------- | ------------------------------------------------------------------- |
| Data Murid       | Informasi Siswa                                                     |
| Absensi          | Kartu Absensi Murid, QR Kelas, Rekap Absensi Kegiatan               |
| Akademik & Ujian | Kartu Ujian, Jadwal Pelajaran, Kalender Pendidikan, Jurnal Mengajar |
| Administrasi     | PDF Buku Tamu Digital                                               |

Satu dropdown tetap digunakan. Judul kelompok memakai `optgroup` bawaan HTML. Kelompok dibentuk dari pilihan yang sudah disaring berdasarkan hak akses; kelompok kosong tidak ditampilkan. Pilihan yang belum masuk kategori tetap ditampilkan. Pengelompokan juga berlaku pada pemilih khusus Informasi Siswa, QR Kelas, dan Buku Tamu. Cetak Raport tetap memakai daftar sebelumnya.

## Acuan dan batas desain

| Elemen          | Acuan                                                            | Verifikasi                                                                                                                                        |
| --------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pilihan dokumen | Rapkumer `src/lib/components/cetak/DocumentMuridSelector.svelte` | Verified Rapkumer: native select, bind value, pilihan dokumen; tidak mengganti kontrol dengan menu khusus.                                        |
| Dimensi         | Kaganga selector sebelum perubahan                               | Fallback Kaganga, diukur browser: tinggi 40 px; lebar mengikuti kontainer. Dibandingkan sebelum/sesudah pada viewport 1440, 768, 390, dan 320 px. |
| Tata letak      | Kaganga CetakSR dan selector sebelumnya                          | Kelas CSS, padding, jarak, sidebar, tombol, dan perilaku responsif tetap. Tidak menambah filter kategori atau modal.                              |
| PDF dan izin    | Loader/preview/endpoint yang sudah ada                           | Tidak ada perubahan pada sumber data, filter izin, parameter dokumen, atau template PDF.                                                          |

## Verifikasi

Browser menggunakan database salinan dan akun sintetis. Bukti berada di `tmp/document-groups/` serta log `tmp/document-groups-*.log`: konservasi sembilan pilihan, empat kelompok, ukuran kontrol, overflow desktop/tablet/HP, pemilihan dan keyboard, tautan dokumen langsung, pemilih pada tiga tampilan khusus, serta Cetak Raport tanpa kelompok tambahan.

Browser lulus pada seluruh skenario tersebut. Ukuran kontrol dan seluruh sembilan pilihan dibandingkan dengan kondisi sebelum perubahan dan tetap sama. Pemeriksaan tipe lulus dengan 0 error dan 119 warning; build lulus. Komponen opsi dan selector lulus ESLint; temuan lama pada komponen induk CetakSR dicatat terpisah di log. Tidak dilakukan perubahan data operasional atau pengujian ulang seluruh PDF untuk pengelompokan pilihan ini.
