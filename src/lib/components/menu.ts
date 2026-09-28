export const appMenuItems: MenuItem[] = [
	{
		title: 'Informasi Umum',
		icon: 'chart',
		subMenu: [
			{
				title: 'Data Sekolah',
				path: '/sekolah'
			},
			{
				title: 'Data Rapor',
				path: '/akademik'
			},
			{
				title: 'Data Pegawai',
				path: '/pegawai'
			},
			{
				title: 'Data Kelas',
				path: '/kelas'
			},
			{
				title: 'Data Murid',
				path: '/murid'
			},
			{
				title: 'Arsip Murid & Alumni',
				path: '/murid/arsip',
				permission: 'murid_arsip',
				tags: ['alumni', 'kelulusan', 'kenaikan kelas', 'pindah', 'keluar']
			},
			{
				title: 'Riwayat Pertumbuhan',
				path: '/riwayat-pertumbuhan'
			}
		]
	},
	{
		title: 'Kurikulum',
		icon: 'calendar',
		tags: ['jadwal', 'bell', 'akademik', 'jadwal pelajaran'],
		subMenu: [
			{
				title: 'Data Mata Pelajaran',
				path: '/data-mata-pelajaran'
			},
			{
				title: 'RPM',
				path: '/rpm',
				permission: 'kurikulum_rpm',
				tags: ['rencana pembelajaran mendalam', 'deep learning', 'modul ajar', 'lampiran']
			},
			{
				title: 'Jadwal Pelajaran',
				path: '/rapor/jadwal-pelajaran'
			},
			{
				title: 'Pengaturan Jadwal',
				path: '/jadwal/pengaturan'
			},
			{
				title: 'Rekomendasi Jadwal',
				path: '/jadwal/rekomendasi',
				permission: 'penjadwalan_rekomendasi',
				tags: ['semiotomatis', 'bentrok guru', 'target jp', 'preferensi']
			},
			{
				title: 'Manajemen Ruangan',
				path: '/ruangan',
				permission: 'ruangan_lihat',
				tags: ['ruang kelas', 'laboratorium', 'bentrok ruang']
			},
			{
				title: 'Kalender Pendidikan',
				path: '/jadwal/kalender'
			},
			{
				title: 'Sesi Ujian',
				path: '/ujian',
				permission: 'ujian_manage',
				tags: ['kartu ujian', 'peserta ujian', 'ruang ujian', 'lms']
			},
			{
				title: 'Jurnal Mengajar',
				path: '/jurnal-mengajar'
			},
			{
				title: 'Pengaturan Martikulasi',
				path: '/martikulasi/pengaturan',
				tags: ['masa persiapan', 'tim martikulasi', 'sttm']
			}
		]
	},
	{
		title: 'Mata Pelajaran',
		icon: 'book',
		subMenu: [
			{
				title: 'Intrakurikuler',
				path: '/intrakurikuler',
				tags: ['tujuan pembelajaran', 'lingkup materi', 'tp']
			},
			{
				title: 'Kokurikuler',
				path: '/kokurikuler'
			},
			{
				title: 'Ekstrakurikuler',
				path: '/ekstrakurikuler'
			},
			{
				title: 'Keasramaan',
				path: '/keasramaan'
			}
		]
	},
	{
		title: 'Input Nilai',
		icon: 'pen',
		subMenu: [
			{
				title: 'Intrakurikuler',
				subMenu: [
					{
						title: 'Formatif',
						path: '/asesmen-formatif',
						tags: ['nilai']
					},
					{
						title: 'Sumatif',
						path: '/asesmen-sumatif',
						tags: ['nilai']
					}
				]
			},
			{
				title: 'Kokurikuler',
				path: '/asesmen-kokurikuler'
			},
			{
				title: 'Ekstrakurikuler',
				path: '/nilai-ekstrakurikuler'
			},
			{
				title: 'Keasramaan',
				path: '/asesmen-keasramaan'
			},
			{
				title: 'Martikulasi',
				path: '/asesmen-martikulasi',
				tags: ['masa persiapan', 'matrikulasi', 'raport martikulasi']
			}
		]
	},
	{
		title: 'Administrasi',
		icon: 'briefcase',
		subMenu: [
			{
				title: 'Absensi Rapor',
				path: '/absen'
			},
			{
				title: 'Catatan Wali Kelas',
				path: '/catatan-wali-kelas'
			},
			{
				title: 'Catatan Wali Asrama',
				path: '/catatan-wali-asrama'
			},
			{
				title: 'Rekap Nilai Akademik',
				path: '/nilai-akhir'
			},
			{
				title: 'Rekap Nilai Keasramaan',
				path: '/rekap-nilai-asrama'
			},
			{
				title: 'Status Akhir',
				path: '/status-akhir',
				tags: ['kenaikan', 'kelulusan', 'rapor', 'semester genap']
			}
		]
	},
	{
		title: 'Absensi',
		icon: 'activity',
		tags: ['qr', 'absensi digital', 'scan', 'presensi pegawai', 'kehadiran pegawai'],
		subMenu: [
			{
				title: 'Presensi Pegawai',
				path: '/presensi-pegawai',
				permission: 'administrasi_presensi_pegawai',
				tags: ['presensi guru', 'kehadiran pegawai', 'izin', 'sakit', 'cuti']
			},
			{
				title: 'Scan QR',
				path: '/administrasi/absensi/scan'
			},
			{
				title: 'Absensi Kegiatan',
				path: '/administrasi/absensi/kegiatan'
			},
			{
				title: 'Rekap Kegiatan',
				path: '/administrasi/absensi/kegiatan/rekap'
			},
			{
				title: 'Kartu Absensi',
				path: '/administrasi/absensi/kartu-qr'
			},
			{
				title: 'Pengaturan Kegiatan',
				path: '/administrasi/absensi/kegiatan/pengaturan'
			}
		]
	},
	{
		title: 'Surat Menyurat',
		icon: 'briefcase',
		tags: [
			'surat',
			'sppd',
			'dinas luar',
			'perjalanan dinas',
			'tamu',
			'kunjungan',
			'persetujuan',
			'berkas',
			'lampiran'
		],
		subMenu: [
			{
				title: 'Surat Masuk & Keluar',
				path: '/surat-menyurat/arsip',
				permission: 'surat_arsip',
				tags: ['surat masuk', 'surat keluar', 'arsip', 'persetujuan']
			},
			{
				title: 'Pusat Persetujuan',
				path: '/persetujuan',
				permission: 'persetujuan_lihat',
				tags: ['persetujuan', 'dokumen', 'waka', 'kepala sekolah', 'terbit']
			},
			{
				title: 'Manajemen Berkas',
				path: '/berkas',
				permission: 'berkas_lihat',
				tags: ['lampiran', 'dokumen', 'arsip', 'ijazah', 'akta', 'sertifikat']
			},
			{
				title: 'Buku Tamu',
				path: '/buku-tamu',
				permission: 'administrasi_buku_tamu',
				tags: ['tamu', 'kunjungan', 'resepsionis']
			},
			{
				title: 'SPPD',
				path: '/surat-menyurat/sppd',
				permission: 'surat_sppd',
				tags: ['surat perintah perjalanan dinas']
			},
			{
				title: 'Dinas Luar',
				path: '/surat-menyurat/dinas-luar',
				permission: 'surat_dinas_luar',
				tags: ['pengajuan', 'perjalanan dinas']
			}
		]
	},
	{
		title: 'Inventaris',
		icon: 'database',
		tags: ['aset', 'sarpras', 'barang', 'peminjaman', 'perawatan', 'qr'],
		subMenu: [
			{
				title: 'Daftar Aset',
				path: '/inventaris',
				permission: 'inventaris_lihat',
				tags: ['aset', 'sarpras', 'barang', 'qr']
			},
			{
				title: 'Peminjaman',
				path: '/inventaris/peminjaman',
				permission: 'inventaris_lihat',
				tags: ['pinjam', 'pengembalian', 'peminjam']
			},
			{
				title: 'Perawatan',
				path: '/inventaris/perawatan',
				permission: 'inventaris_lihat',
				tags: ['pemeliharaan', 'perbaikan', 'kondisi']
			}
		]
	},
	{
		title: 'Lain-lain',
		icon: 'grid',
		tags: ['portal wali murid', 'komunikasi', 'pengumuman', 'agenda'],
		subMenu: [
			{
				title: 'Portal Wali Murid',
				path: '/portal-wali',
				permission: 'portal_wali_lihat',
				tags: ['orang tua', 'wali murid', 'anak', 'presensi', 'raport']
			},
			{
				title: 'Komunikasi',
				path: '/komunikasi',
				permission: 'komunikasi_lihat',
				tags: ['pesan', 'email', 'whatsapp', 'template', 'antrean']
			},
			{
				title: 'Pengumuman & Agenda',
				path: '/pengumuman',
				permission: 'pengumuman_lihat',
				tags: ['pengumuman', 'agenda', 'rapat', 'ujian', 'asrama', 'kalender']
			}
		]
	},
	{
		title: 'Cetak',
		icon: 'print',
		tags: ['cetak', 'dokumen', 'raport', 'pdf'],
		subMenu: [
			{
				title: 'Cetak Dokumen',
				path: '/cetak'
			},
			{
				title: 'Cetak Raport',
				path: '/cetak-raport'
			}
		]
	}
];
