import { hasRole } from './user-role.ts';
type HomeroomUser =
	| {
			type?: string | null;
            roles?: readonly string[] | null;
			waliKelasIds?: readonly number[];
	  }
	| null
	| undefined;

export function isHomeroomTeacher(user: HomeroomUser) {
	return (hasRole(user, 'user') || user?.type === 'wali_kelas') && !!user?.waliKelasIds?.length;
}

export function isHomeroomPage(path: string) {
	return /^\/(murid|catatan-wali-kelas|status-akhir|nilai-akhir|absen|akademik|cetak|cetak-raport|cetak-sr)(\/|$)/.test(
		path
	);
}
