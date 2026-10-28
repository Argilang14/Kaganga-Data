import { profileFilePath } from './student-profile-files';

export const MAX_STUDENT_PROFILE_PHOTO_BYTES = 5 * 1024 * 1024;

// Separate from primary photos: the existing student-photo endpoint accepts basenames only.
export function studentProfilePhotoPath(sekolahId: number, storageKey: string) {
	return profileFilePath(sekolahId, storageKey);
}
