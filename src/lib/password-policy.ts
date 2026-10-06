export type PasswordValidation = { valid: true } | { valid: false; message: string };

export function validatePassword(password: string): PasswordValidation {
	if (password.length < 8) return { valid: false, message: 'Kata sandi minimal 8 karakter.' };
	if (password.length > 128) return { valid: false, message: 'Kata sandi maksimal 128 karakter.' };
	if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
		return { valid: false, message: 'Kata sandi harus memuat huruf dan angka.' };
	}
	return { valid: true };
}
