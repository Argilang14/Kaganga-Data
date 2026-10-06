export type PendidikanPegawai = {
	id: number;
	jenjang: string;
	institusi: string;
	programStudi: string | null;
	tahunLulus: number | null;
	nomorIjazah: string | null;
	isTerakhir: boolean;
};

export type SertifikasiPegawai = {
	id: number;
	jenis: string;
	nama: string;
	penyelenggara: string | null;
	nomor: string | null;
	tanggalMulai: string | null;
	tanggalSelesai: string | null;
	berlakuSampai: string | null;
	catatan: string | null;
};

export type DokumenPegawai = {
	id: number;
	jenis: string;
	nama: string;
	nomor: string | null;
	tanggal: string | null;
	filePath: string;
	mimeType: string | null;
	ukuran: number | null;
};
