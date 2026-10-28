<script lang="ts">
	import SchoolBrandPanel from '$lib/components/login/school-brand-panel.svelte';
	import LoginForm from '$lib/components/login/login-form.svelte';
	import type { PageProps } from './$types';
	let { data, form }: PageProps = $props();
</script>

<main class="school-login" data-theme="light">
	<div class="login-layout">
		<SchoolBrandPanel />
		<div class="login-form-panel">
			<LoginForm school={data.loginSchool} serverMessage={form?.message} />
		</div>
	</div>
</main>

<style>
	.school-login {
		--login-navy: #0f274b;
		--login-blue: #1e5aa8;
		--login-sky: #eaf2ff;
		--login-text: #163257;
		--login-border: #d7e3f4;
		--color-primary: var(--login-blue);
		--color-primary-content: #fff;
		color-scheme: light;
		min-height: 100dvh;
		display: grid;
		place-items: center;
		padding: 32px;
		background: #f5f7fb;
		color: var(--login-text);
		letter-spacing: 0;
	}
	.login-layout {
		display: grid;
		grid-template-columns: minmax(0, 45fr) minmax(0, 55fr);
		width: 100%;
		max-width: 1200px;
		min-height: min(760px, calc(100dvh - 64px));
	}
	.login-form-panel {
		display: grid;
		place-items: center;
		min-width: 0;
		padding: 32px;
		background: var(--login-sky);
		border-radius: 0 20px 20px 0;
	}
	@media (min-width: 1024px) and (max-width: 1279px) {
		.school-login {
			padding: 24px;
		}
		.login-form-panel {
			padding: 24px;
		}
	}
	@media (min-width: 768px) and (max-width: 1023px) {
		.school-login {
			padding: 16px;
		}
		.login-layout {
			grid-template-columns: minmax(0, 38fr) minmax(0, 62fr);
		}
		.login-form-panel {
			padding: 20px;
		}
	}
	@media (max-width: 767px) {
		.school-login {
			display: block;
			padding: 0;
		}
		.login-layout {
			display: block;
			min-height: 100dvh;
		}
		.login-form-panel {
			position: relative;
			margin-top: -24px;
			padding: 0 16px 24px;
			background: transparent;
			border-radius: 0;
		}
	}
</style>
