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
				path: '/rapor'
			},
			{
				title: 'Data Pegawai',
				path: '/pegawai'
			},
			{
				title: 'Data Mata Pelajaran',
				path: '/data-mata-pelajaran'
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
				title: 'Riwayat Pertumbuhan',
				path: '/riwayat-pertumbuhan'
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
				title: 'Rekap Nilai Asrama',
				path: '/rekap-nilai-asrama'
			},
			{
				title: 'Status Akhir',
				path: '/status-akhir'
			}
		]
	},
	{
		title: 'Absensi',
		icon: 'activity',
		tags: ['qr', 'absensi digital', 'scan'],
		subMenu: [
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
		title: 'Jadwal',
		icon: 'calendar',
		tags: ['jadwal pelajaran', 'kaldik', 'kalender pendidikan'],
		subMenu: [
			{
				title: 'Jadwal Pelajaran',
				path: '/jadwal/pelajaran'
			},

			{
				title: 'Aturan Generate Jadwal',
				path: '/jadwal/generate'
			},
			{
				title: 'Kalender Pendidikan',
				path: '/jadwal/kalender'
			},
			{
				title: 'Pengaturan Jadwal',
				path: '/jadwal/pengaturan'
			}
		]
	},
	{
		title: 'Cetak Dokumen',
		icon: 'print',
		path: '/cetak'
	},
	{
		title: 'Cetak Dokumen SR',
		icon: 'print',
		path: '/cetak?sr=1'
	}
];
