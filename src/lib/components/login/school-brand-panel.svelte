<section class="brand-panel" aria-label="KAGANGA, SRT 3 Provinsi Bengkulu">
	<img
		class="school-photo"
		src="/login/school-drone.jpg"
		alt="Foto udara lingkungan sekolah SRT 3 Provinsi Bengkulu"
		width="1600"
		height="1200"
		fetchpriority="high"
	/>
	<img
		class="rafflesia"
		src="/login/rafflesia.webp"
		alt=""
		aria-hidden="true"
		width="384"
		height="384"
		decoding="async"
		fetchpriority="low"
	/>
	<div class="brand-content">
		<header>
			<div class="wordmark">
				<span class="app-mark"><img src="/logo.png" alt="" width="40" height="40" /></span>
				<h1>KAGANGA</h1>
			</div>
			<p class="brand-description">Kawasan Administrasi, Gerbang Akademik, dan Arsip Data</p>
		</header>
		<div class="school-identity">
			<p class="school-name">SRT 3 Provinsi Bengkulu</p>
			<p class="school-motto">Cerdas Bersama, Tumbuh Setara</p>
		</div>
	</div>
</section>

<style>
	.brand-panel {
		position: relative;
		isolation: isolate;
		display: flex;
		min-height: 640px;
		overflow: hidden;
		border-radius: 20px 0 0 20px;
		color: #fff;
		background: #0f274b;
	}
	.school-photo {
		position: absolute;
		inset: 0;
		z-index: -2;
		width: 100%;
		height: 100%;
		object-fit: cover;
		object-position: 52% center;
	}
	.brand-panel::after {
		content: '';
		position: absolute;
		inset: 0;
		z-index: -1;
		background: linear-gradient(
			180deg,
			rgb(15 39 75 / 94%) 0%,
			rgb(15 39 75 / 52%) 30%,
			rgb(15 39 75 / 12%) 54%,
			rgb(15 39 75 / 90%) 100%
		);
	}
	.rafflesia {
		position: absolute;
		top: 16px;
		right: -16px;
		width: 176px;
		height: 176px;
		opacity: 0.18;
		pointer-events: none;
	}
	.brand-content {
		display: flex;
		flex: 1;
		min-width: 0;
		flex-direction: column;
		justify-content: space-between;
		gap: 12rem;
		padding: 48px 40px;
	}
	.wordmark {
		display: flex;
		align-items: center;
		gap: 12px;
	}
	.wordmark h1 {
		margin: 0;
		font-size: 42px;
		line-height: 1.2;
		font-weight: 800;
		letter-spacing: 0;
	}
	.app-mark {
		display: grid;
		place-items: center;
		flex: 0 0 48px;
		width: 48px;
		height: 48px;
		background: #fff;
		border-radius: 12px;
	}
	.brand-description {
		max-width: 320px;
		margin-top: 16px;
		font-size: 15px;
		line-height: 1.6;
		color: #eef5ff;
	}
	.school-identity {
		border-top: 1px solid rgb(255 255 255 / 35%);
		padding-top: 20px;
	}
	.school-name {
		font-size: 28px;
		line-height: 1.3;
		font-weight: 700;
	}
	.school-motto {
		margin-top: 8px;
		font-size: 15px;
		line-height: 1.6;
		color: #eef5ff;
	}
	@media (min-width: 1024px) and (max-width: 1279px) {
		.brand-content {
			padding: 40px 28px;
		}
		.wordmark h1 {
			font-size: 32px;
		}
		.school-name {
			font-size: 24px;
		}
	}
	@media (min-width: 768px) and (max-width: 1023px) {
		.brand-content {
			padding: 32px 24px;
		}
		.wordmark h1 {
			font-size: 30px;
		}
		.app-mark {
			display: none;
		}
		.brand-description {
			font-size: 14px;
		}
		.school-name {
			font-size: 22px;
		}
	}
	@media (max-width: 767px) {
		.brand-panel {
			min-height: 264px;
			border-radius: 0;
		}
		.school-photo {
			object-position: 50% 44%;
		}
		.brand-panel::after {
			background: linear-gradient(100deg, rgb(15 39 75 / 92%), rgb(15 39 75 / 38%));
		}
		.brand-content {
			gap: 24px;
			padding: 24px 24px 48px;
		}
		.wordmark h1 {
			font-size: 32px;
		}
		.app-mark {
			flex-basis: 40px;
			width: 40px;
			height: 40px;
			border-radius: 10px;
		}
		.app-mark img {
			width: 32px;
			height: 32px;
		}
		.brand-description {
			max-width: 280px;
			margin-top: 8px;
			font-size: 12px;
		}
		.school-identity {
			padding-top: 12px;
		}
		.school-name {
			font-size: 18px;
		}
		.school-motto {
			margin-top: 4px;
			font-size: 13px;
		}
		.rafflesia {
			top: 12px;
			right: 4px;
			width: 96px;
			height: 96px;
		}
	}
</style>
