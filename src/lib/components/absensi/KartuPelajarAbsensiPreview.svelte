<script lang="ts">
	let {
		sekolahNama,
		sekolahNaungan,
		sekolahAlamat,
		logoUrl,
		muridNama,
		nisn,
		tempatTanggalLahir,
		kelas,
		alamat,
		fotoUrl,
		qrDataUrl
	}: {
		sekolahNama: string;
		sekolahNaungan: string;
		sekolahAlamat: string;
		logoUrl: string;
		muridNama: string;
		nisn: string;
		tempatTanggalLahir: string;
		kelas: string;
		alamat: string;
		fotoUrl: string | null;
		qrDataUrl: string | null;
	} = $props();

	const rows = $derived([
		['Nama Lengkap', muridNama],
		['NISN', nisn || '-'],
		['T.T.L', tempatTanggalLahir || '-'],
		['Kelas', kelas || '-'],
		['Alamat', alamat || '-']
	]);
</script>

<article class="student-card" aria-label={`Preview kartu pelajar dan absensi ${muridNama}`}>
	<div class="card-header">
		<div class="logo-frame">
			<img src={logoUrl} alt={`Logo ${sekolahNama}`} />
		</div>
		<div class="school-heading">
			<div class="authority">{sekolahNaungan}</div>
			<div class="school-name">{sekolahNama}</div>
			<div class="school-address">{sekolahAlamat}</div>
		</div>
	</div>
	<div class="front-title">KARTU PELAJAR &amp; ABSENSI</div>
	<div class="front-body">
		<div class="front-media">
			<div class="photo-frame">
				{#if fotoUrl}
					<img src={fotoUrl} alt={`Foto ${muridNama}`} />
				{:else}
					<span>FOTO</span>
				{/if}
			</div>
			{#if qrDataUrl}
				<img class="front-qr" src={qrDataUrl} alt={`QR Absensi ${muridNama}`} />
			{:else}
				<div class="qr-empty">QR BELUM SIAP</div>
			{/if}
		</div>
		<div class="identity-list">
			{#each rows as row}
				<div class="identity-row">
					<div class="identity-label">{row[0]}</div>
					<div>:</div>
					<div class="identity-value">{row[1]}</div>
				</div>
			{/each}
		</div>
	</div>
	<div class="card-footer">{sekolahNama}</div>
</article>

<style>
	.student-card {
		position: relative;
		width: 100%;
		aspect-ratio: 85.6 / 54;
		overflow: hidden;
		border: 1px solid #1d3542;
		border-radius: 7px;
		background: #fff;
		color: #102a38;
		font-family: Arial, Helvetica, sans-serif;
		box-shadow: 0 2px 8px rgb(15 23 42 / 10%);
	}

	.student-card::before {
		content: '';
		position: absolute;
		top: 0;
		right: 0;
		width: 14%;
		aspect-ratio: 1;
		background: #6ec4d8;
		clip-path: polygon(100% 0, 100% 100%, 0 0);
	}

	.student-card::after {
		content: '';
		position: absolute;
		right: 0;
		bottom: 0;
		width: 29%;
		height: 8.4%;
		background: #0b4964;
		clip-path: polygon(18% 0, 100% 0, 100% 100%, 0 100%);
	}

	.card-header {
		position: relative;
		z-index: 1;
		height: 21.3%;
		display: grid;
		grid-template-columns: 10.5% minmax(0, 1fr);
		align-items: center;
		gap: 2.3%;
		padding: 1.8% 4.7%;
		color: #fff;
		background: #0b4964;
	}

	.logo-frame {
		aspect-ratio: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		overflow: hidden;
		border-radius: 5px;
		background: #fff;
	}

	.logo-frame img {
		width: 88%;
		height: 88%;
		object-fit: contain;
	}

	.school-heading {
		min-width: 0;
		padding-right: 8%;
	}

	.authority {
		font-size: clamp(5px, 1.4vw, 8px);
		font-weight: 800;
		line-height: 1.1;
	}

	.school-name {
		margin-top: 1px;
		overflow: hidden;
		display: -webkit-box;
		font-size: clamp(6px, 1.7vw, 10px);
		font-weight: 800;
		line-height: 1.05;
		-webkit-box-orient: vertical;
		-webkit-line-clamp: 2;
	}

	.school-address {
		margin-top: 1px;
		overflow: hidden;
		font-size: clamp(4px, 1.1vw, 7px);
		line-height: 1.1;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.front-title {
		margin: 1.4% 4.7% 1%;
		color: #0b4964;
		font-size: clamp(7px, 2vw, 12px);
		font-weight: 900;
		text-align: center;
	}

	.front-body {
		display: grid;
		grid-template-columns: 20% minmax(0, 1fr);
		gap: 3%;
		padding: 0 5.2%;
	}

	.front-media {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 3px;
	}

	.photo-frame {
		width: 76%;
		aspect-ratio: 13 / 15.5;
		display: flex;
		align-items: center;
		justify-content: center;
		overflow: hidden;
		border: 1px solid #436272;
		background: #f7fafb;
		color: #7b909a;
		font-size: clamp(5px, 1.2vw, 7px);
		font-weight: 700;
	}

	.photo-frame img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		object-position: center top;
	}

	.front-qr {
		width: 91%;
		aspect-ratio: 1;
		object-fit: contain;
	}

	.qr-empty {
		width: 91%;
		aspect-ratio: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		border: 1px dashed #8ba4af;
		color: #647983;
		font-size: clamp(4px, 1vw, 6px);
		font-weight: 800;
		text-align: center;
	}

	.identity-list {
		min-width: 0;
	}

	.identity-row {
		display: grid;
		grid-template-columns: 27% 3% minmax(0, 1fr);
		min-height: 12%;
		align-items: start;
		padding: 1.1% 0;
		border-bottom: 1px solid #bdd7e1;
		font-size: clamp(5px, 1.35vw, 8px);
		line-height: 1.1;
	}

	.identity-label,
	.identity-value {
		font-weight: 700;
	}

	.identity-value {
		min-width: 0;
		max-height: 2.3em;
		overflow: hidden;
		overflow-wrap: anywhere;
	}

	.card-footer {
		position: absolute;
		left: 4.7%;
		right: 4.7%;
		bottom: 1.5%;
		z-index: 1;
		overflow: hidden;
		color: #476572;
		font-size: clamp(4px, 1vw, 6px);
		font-weight: 700;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
</style>
