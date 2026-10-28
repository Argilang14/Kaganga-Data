<script lang="ts">
	import { tick } from 'svelte';
	import FormEnhance from '$lib/components/form-enhance.svelte';
	import Icon from '$lib/components/icon.svelte';
	let {
		school,
		serverMessage
	}: { school: { name: string; logo: string | null }; serverMessage?: string } = $props();
	let username = $state('');
	let password = $state('');
	let showPassword = $state(false);
	let message = $derived(serverMessage ?? '');
	let busy = $state(false);
	let errorElement = $state<HTMLDivElement>();
	async function showFailure(data?: Record<string, unknown>) {
		message =
			typeof data?.message === 'string'
				? data.message
				: 'Belum dapat terhubung. Periksa koneksi, lalu coba masuk kembali.';
		await tick();
		errorElement?.focus();
	}
</script>

<section class="card login-card" aria-labelledby="login-title">
	<header class="login-header">
		<img
			class="school-logo"
			src={school.logo || '/logo.png'}
			alt={school.logo ? `Logo ${school.name}` : 'KAGANGA'}
			width="80"
			height="80"
		/>
		<h2 id="login-title">Selamat Datang Kembali</h2>
		<p>Masuk ke sistem KAGANGA untuk melanjutkan</p>
	</header>
	<FormEnhance
		action="?/login"
		class="login-form"
		showToast={false}
		preventDuplicateSubmit
		onfailure={({ data }) => void showFailure(data)}
		onerror={() => void showFailure()}
		submitStateChange={(value) => (busy = value)}
	>
		{#snippet children({ submitting, invalid })}
			<div class="fieldset login-field">
				<label class="fieldset-legend" for="username">Nama pengguna</label>
				<div class="input login-input" class:has-error={!!message}>
					<Icon name="user" class="size-5 shrink-0" />
					<input
						id="username"
						name="username"
						type="text"
						bind:value={username}
						required
						autocomplete="username"
						autocapitalize="none"
						spellcheck={false}
						placeholder="Masukkan nama pengguna"
						aria-invalid={!!message}
						aria-describedby={message ? 'login-error' : undefined}
						oninput={() => (message = '')}
					/>
				</div>
			</div>
			<div class="fieldset login-field">
				<label class="fieldset-legend" for="password">Kata sandi</label>
				<div class="input login-input" class:has-error={!!message}>
					<Icon name="lock" class="size-5 shrink-0" />
					<input
						id="password"
						name="password"
						type={showPassword ? 'text' : 'password'}
						bind:value={password}
						required
						autocomplete="current-password"
						placeholder="Masukkan kata sandi"
						aria-invalid={!!message}
						aria-describedby={message ? 'login-error' : undefined}
						oninput={() => (message = '')}
					/>
					<button
						type="button"
						class="btn btn-ghost btn-square password-toggle"
						onclick={() => (showPassword = !showPassword)}
						aria-label={showPassword ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'}
						title={showPassword ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'}
						aria-pressed={showPassword}
					>
						<Icon name={showPassword ? 'eye-off' : 'eye'} class="size-5" />
					</button>
				</div>
			</div>
			{#if message}
				<div
					id="login-error"
					class="alert alert-error alert-soft login-error"
					role="alert"
					tabindex="-1"
					bind:this={errorElement}
				>
					<Icon name="warning" class="size-5 shrink-0" /><span>{message}</span>
				</div>
			{/if}
			<button
				class="btn btn-primary login-submit"
				type="submit"
				disabled={submitting || invalid || !username.trim() || !password}
				aria-busy={busy}
			>
				{#if submitting}<span class="loading loading-spinner loading-sm" aria-hidden="true"
					></span>{:else}<Icon name="right" class="size-5" />{/if}
				<span aria-live="polite">{submitting ? 'Sedang masuk...' : 'Masuk'}</span>
			</button>
		{/snippet}
	</FormEnhance>
	<footer class="login-footer">
		© 2026 KAGANGA <span aria-hidden="true">•</span> SRT 3 Provinsi Bengkulu
	</footer>
</section>

<style>
	.login-card {
		width: 100%;
		max-width: 520px;
		min-width: 0;
		padding: 40px 32px 24px;
		border: 1px solid rgb(215 227 244 / 60%);
		border-radius: 16px;
		background: #fff;
		color: var(--login-text);
		box-shadow: 0 10px 30px rgb(15 39 75 / 8%);
	}
	.login-header {
		text-align: center;
	}
	.school-logo {
		display: block;
		width: 80px;
		height: 80px;
		margin: 0 auto 24px;
		object-fit: contain;
	}
	.login-header h2 {
		font-size: 28px;
		line-height: 1.3;
		font-weight: 700;
		color: var(--login-navy);
	}
	.login-header p {
		margin-top: 8px;
		font-size: 14px;
		line-height: 1.6;
		color: #526987;
	}
	.login-card :global(.login-form) {
		display: grid;
		gap: 20px;
		margin-top: 32px;
	}
	.login-field {
		display: block;
		min-width: 0;
		padding: 0;
	}
	.login-field .fieldset-legend {
		padding: 0 0 8px;
		font-size: 14px;
		line-height: 1.5;
		font-weight: 600;
		color: var(--login-text);
	}
	.login-input {
		display: flex;
		width: 100%;
		height: 48px;
		min-height: 48px;
		padding: 0 14px;
		gap: 10px;
		border: 1px solid var(--login-border);
		border-radius: 12px;
		outline: none;
		background: #fff;
		box-shadow: none;
		color: #526987;
	}
	.login-input:hover {
		border-color: #9bb7da;
	}
	.login-input:focus-within {
		border-color: var(--login-blue);
		outline: 3px solid rgb(30 90 168 / 14%);
		outline-offset: 1px;
	}
	.login-input input {
		width: 100%;
		min-width: 0;
		height: 100%;
		font-size: 16px;
		color: var(--login-text);
		outline: none;
	}
	.login-input input::placeholder {
		color: #60748e;
		font-size: 14px;
		opacity: 1;
	}
	.login-input.has-error {
		border-color: #c2384f;
	}
	.password-toggle {
		width: 44px;
		height: 44px;
		min-height: 44px;
		flex: 0 0 44px;
		margin-right: -12px;
		border-radius: 10px;
		color: #526987;
	}
	.password-toggle:focus-visible {
		outline: 2px solid var(--login-blue);
		outline-offset: -4px;
	}
	.login-submit {
		width: 100%;
		height: 48px;
		min-height: 48px;
		margin-top: 4px;
		border: 1px solid var(--login-blue);
		border-radius: 12px;
		background: var(--login-blue);
		color: #fff;
		font-size: 16px;
		font-weight: 600;
		box-shadow: none;
	}
	.login-submit:hover:not(:disabled) {
		background: #174b90;
		border-color: #174b90;
	}
	.login-submit:focus-visible {
		outline: 3px solid rgb(30 90 168 / 35%);
		outline-offset: 3px;
	}
	.login-submit:disabled {
		background: #e5ebf3;
		border-color: #e5ebf3;
		color: #60748e;
		opacity: 1;
	}
	.login-error {
		display: flex;
		align-items: flex-start;
		gap: 8px;
		padding: 12px;
		border-radius: 8px;
		background: #fff0f2;
		color: #9d233a;
		font-size: 14px;
		line-height: 1.5;
		overflow-wrap: anywhere;
	}
	.login-error:focus {
		outline: 2px solid #c2384f;
		outline-offset: 2px;
	}
	.login-footer {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: 4px;
		margin-top: 24px;
		padding-top: 20px;
		border-top: 1px solid var(--login-border);
		font-size: 12px;
		line-height: 1.6;
		text-align: center;
		color: #526987;
	}
	@media (max-width: 1279px) {
		.login-card {
			padding: 32px 24px 24px;
		}
		.login-header h2 {
			font-size: 24px;
		}
	}
	@media (max-width: 767px) {
		.login-card {
			padding: 28px 24px 24px;
		}
		.school-logo {
			width: 64px;
			height: 64px;
			margin-bottom: 20px;
		}
		.login-card :global(.login-form) {
			margin-top: 24px;
		}
	}
	@media (max-width: 359px) {
		.login-card {
			padding-right: 20px;
			padding-left: 20px;
		}
		.login-header h2 {
			font-size: 22px;
		}
	}
</style>
