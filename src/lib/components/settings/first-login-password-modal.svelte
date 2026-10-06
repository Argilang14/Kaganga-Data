<script lang="ts">
	import FormEnhance from '$lib/components/form-enhance.svelte';
	import Icon from '$lib/components/icon.svelte';

	let showCurrent = $state(false);
	let showNew = $state(false);
	let showRepeat = $state(false);

	function finishPasswordChange() {
		window.location.assign('/');
	}
</script>

<div class="modal modal-open" role="dialog" aria-modal="true" aria-labelledby="first-login-title">
	<div class="modal-box mx-4 w-full max-w-lg rounded-lg p-0">
		<header class="border-base-300 border-b px-5 py-4 sm:px-6">
			<div class="flex items-start gap-3">
				<div class="bg-warning/15 text-warning flex size-10 shrink-0 items-center justify-center rounded-lg">
					<Icon name="lock" />
				</div>
				<div>
					<h2 id="first-login-title" class="text-xl font-bold">Ganti Kata Sandi Pertama</h2>
					<p class="text-base-content/65 mt-1 text-sm">
						Untuk keamanan akun, ganti kata sandi bawaan sebelum menggunakan Kaganga.
					</p>
				</div>
			</div>
		</header>

		<FormEnhance action="?/change-password" onsuccess={finishPasswordChange}>
			{#snippet children({ submitting, invalid })}
				<div class="space-y-4 px-5 py-5 sm:px-6">
					<fieldset class="fieldset">
						<legend class="fieldset-legend">Kata sandi saat ini</legend>
						<label class="input bg-base-200 w-full">
							<Icon name="lock" />
							<input
								name="currentPassword"
								type={showCurrent ? 'text' : 'password'}
								autocomplete="current-password"
								required
							/>
							<button
								type="button"
								class="btn btn-ghost btn-xs btn-square"
								onclick={() => (showCurrent = !showCurrent)}
								aria-label="Lihat atau sembunyikan kata sandi saat ini"
							>
								<Icon name={showCurrent ? 'eye-off' : 'eye'} />
							</button>
						</label>
					</fieldset>

					<div class="grid gap-4 sm:grid-cols-2">
						<fieldset class="fieldset">
							<legend class="fieldset-legend">Kata sandi baru</legend>
							<label class="input bg-base-200 w-full">
								<Icon name="key" />
								<input
									name="newPassword"
									type={showNew ? 'text' : 'password'}
									autocomplete="new-password"
									minlength="8"
									maxlength="128"
									required
								/>
								<button
									type="button"
									class="btn btn-ghost btn-xs btn-square"
									onclick={() => (showNew = !showNew)}
									aria-label="Lihat atau sembunyikan kata sandi baru"
								>
									<Icon name={showNew ? 'eye-off' : 'eye'} />
								</button>
							</label>
						</fieldset>

						<fieldset class="fieldset">
							<legend class="fieldset-legend">Ulangi kata sandi baru</legend>
							<label class="input bg-base-200 w-full">
								<Icon name="key" />
								<input
									name="confirmPassword"
									type={showRepeat ? 'text' : 'password'}
									autocomplete="new-password"
									minlength="8"
									maxlength="128"
									required
								/>
								<button
									type="button"
									class="btn btn-ghost btn-xs btn-square"
									onclick={() => (showRepeat = !showRepeat)}
									aria-label="Lihat atau sembunyikan konfirmasi kata sandi"
								>
									<Icon name={showRepeat ? 'eye-off' : 'eye'} />
								</button>
							</label>
						</fieldset>
					</div>

					<div class="alert alert-info alert-soft py-3 text-sm">
						<Icon name="info" />
						<span>Gunakan minimal 8 karakter yang memuat huruf dan angka.</span>
					</div>
				</div>

				<footer class="border-base-300 flex justify-end border-t px-5 py-4 sm:px-6">
					<button class="btn btn-primary" type="submit" disabled={submitting || invalid}>
						<Icon name="save" />
						{submitting ? 'Menyimpan...' : 'Simpan dan Lanjutkan'}
					</button>
				</footer>
			{/snippet}
		</FormEnhance>
	</div>
</div>
