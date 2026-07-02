type PegawaiRingkas = Pick<Pegawai, 'id' | 'nama' | 'nip'>;

export type KelasCard = Omit<Kelas, 'sekolah'> & {
	waliKelas?: PegawaiRingkas | null;
	jumlahMurid: number;
	jumlahMapel: number;
	jumlahEkstrakurikuler: number;
	jumlahKokurikuler: number;
};

export type DeleteKelasModalHandle = {
	open: (kelas: KelasCard) => void;
	close: () => void;
};
