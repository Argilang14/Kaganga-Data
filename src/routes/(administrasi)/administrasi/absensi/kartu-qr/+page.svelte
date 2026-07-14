<script lang="ts">
	/* eslint-disable svelte/no-navigation-without-resolve -- URL filter dibangun dari route aktif dan query dinamis */
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import Icon from '$lib/components/icon.svelte';

	type CardPayload = {
		muridId: number;
		nama: string;
		nis: string;
		kelas: string;
		sekolah: string;
		logoUrl: string;
		qrDataUrl: string;
		issuedAt: string;
	};

	type PageData = {
		kelasId: number | null;
		kelasList: Array<{ id: number; nama: string; fase: string | null }>;
		sekolahNama: string;
		muridList: Array<{
			id: number;
			nama: string;
			nis: string;
			nisn: string;
			logoUrl: string;
			qr: {
				issuedAt: string;
				tokenVersion: number;
				previewable: boolean;
				qrDataUrl: string | null;
			} | null;
		}>;
	};

	let {
		data,
		form
	}: {
		data: PageData;
		form?: { cards?: CardPayload[]; fail?: string; preview?: boolean; skipped?: number };
	} = $props();

	const kelasLabel = $derived.by(() => {
		const kelas = data.kelasList.find((item) => item.id === data.kelasId);
		if (!kelas) return '-';
		return kelas.fase ? `${kelas.nama} - ${kelas.fase}` : kelas.nama;
	});

	function updateKelas(value: string) {
		const params = new URLSearchParams(page.url.search);
		if (value) params.set('kelas_id', value);
		else params.delete('kelas_id');
		void goto(`${page.url.pathname}?${params.toString()}`, {
			replaceState: true,
			keepFocus: true
		});
	}

	function printCards() {
		window.print();
	}

	function escapeXml(value: string) {
		return value
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;')
			.replace(/'/g, '&apos;');
	}

	function fileToDataUrl(blob: Blob) {
		return new Promise<string>((resolveDataUrl, reject) => {
			const reader = new FileReader();
			reader.onload = () => resolveDataUrl(String(reader.result ?? ''));
			reader.onerror = () => reject(reader.error);
			reader.readAsDataURL(blob);
		});
	}

	async function imageUrlToDataUrl(url: string) {
		try {
			const response = await fetch(url);
			if (!response.ok) return null;
			return await fileToDataUrl(await response.blob());
		} catch {
			return null;
		}
	}

	function splitSvgText(value: string, maxLength = 24) {
		const words = value.trim().split(/\s+/).filter(Boolean);
		const lines: string[] = [];
		let current = '';
		for (const word of words) {
			const next = current ? `${current} ${word}` : word;
			if (next.length > maxLength && current) {
				lines.push(current);
				current = word;
			} else {
				current = next;
			}
		}
		if (current) lines.push(current);
		return lines.slice(0, 2);
	}

	function svgTextLines(value: string, x: number, y: number, size: number, weight = '700') {
		return splitSvgText(value)
			.map(
				(line, index) =>
					`<text x="${x}" y="${y + index * (size + 8)}" text-anchor="middle" font-family="Arial, sans-serif" font-size="${size}" font-weight="${weight}" letter-spacing="5" fill="#333333">${escapeXml(line.toUpperCase())}</text>`
			)
			.join('');
	}

	function cardFromMurid(murid: PageData['muridList'][number]): CardPayload | null {
		if (!murid.qr?.previewable || !murid.qr.qrDataUrl) return null;
		return {
			muridId: murid.id,
			nama: murid.nama,
			nis: murid.nis,
			kelas: kelasLabel,
			sekolah: data.sekolahNama || 'Sekolah',
			logoUrl: murid.logoUrl,
			qrDataUrl: murid.qr.qrDataUrl,
			issuedAt: murid.qr.issuedAt
		};
	}

	async function downloadCard(card: CardPayload) {
		const safeName = card.nama.replace(/[<>:"/\\|?*]+/g, ' ').trim() || 'siswa';
		const logoDataUrl = await imageUrlToDataUrl(card.logoUrl);
		const logoBlock = logoDataUrl
			? `<image href="${logoDataUrl}" x="273" y="118" width="94" height="94" preserveAspectRatio="xMidYMid meet" />`
			: `<circle cx="320" cy="173" r="46" fill="#b2121b" /><text x="320" y="187" text-anchor="middle" font-family="Arial" font-size="34" font-weight="700" fill="#ffffff">${escapeXml(card.sekolah.charAt(0).toUpperCase())}</text>`;
		const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="1000" viewBox="0 0 640 1000">
			<defs>
				<pattern id="dotsTop" width="9" height="9" patternUnits="userSpaceOnUse">
					<circle cx="3" cy="3" r="2" fill="#9f3438" />
				</pattern>
				<pattern id="dotsBottom" width="9" height="9" patternUnits="userSpaceOnUse">
					<circle cx="3" cy="3" r="2" fill="#9f3438" />
				</pattern>
			</defs>
			<rect width="640" height="1000" fill="#ffffff" />
			<polygon points="20,70 180,70 20,242" fill="#5d6969" />
			<polygon points="180,70 268,70 156,187 68,187" fill="#9f3438" />
			<polygon points="255,70 480,70 230,150" fill="url(#dotsTop)" opacity="0.9" />
			<rect x="555" y="118" width="10" height="128" transform="rotate(38 560 182)" fill="#9f3438" />
			<rect x="46" y="572" width="10" height="134" transform="rotate(38 51 639)" fill="#9f3438" />
			<polygon points="620,685 620,933 385,933" fill="#5d6969" />
			<polygon points="420,764 545,764 385,933 257,933" fill="#9f3438" />
			<polygon points="45,852 295,852 218,933 45,933" fill="url(#dotsBottom)" opacity="0.75" />
			${logoBlock}
			<text x="320" y="322" text-anchor="middle" font-family="Arial, sans-serif" font-size="36" font-weight="800" letter-spacing="8" fill="#333333">KARTU ABSENSI</text>
			${svgTextLines(card.sekolah, 320, 374, 22, '800')}
			<image href="${card.qrDataUrl}" x="215" y="465" width="210" height="210" />
			<rect x="95" y="708" width="450" height="88" fill="#ffffff" opacity="0.94" />
			<text x="320" y="740" text-anchor="middle" font-family="Arial, sans-serif" font-size="25" font-weight="800" letter-spacing="2" fill="#333333">${escapeXml(card.nama.toUpperCase())}</text>
			<text x="320" y="783" text-anchor="middle" font-family="Arial, sans-serif" font-size="24" font-weight="800" letter-spacing="2" fill="#333333">NIS ${escapeXml(card.nis)}</text>
		</svg>`;
		const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
		const url = URL.createObjectURL(blob);
		const anchor = document.createElement('a');
		anchor.href = url;
		anchor.download = `Kartu Absensi - ${safeName}.svg`;
		document.body.appendChild(anchor);
		anchor.click();
		anchor.remove();
		URL.revokeObjectURL(url);
	}
</script>

<div class="space-y-4">
	<div class="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
		<div>
			<h2 class="text-2xl font-bold">Kartu Absensi Murid</h2>
			<p class="text-base-content/70 text-sm">
				Satu kartu untuk absensi digital murid, siap dipakai sebagai kartu masuk, pulang, dan
				kegiatan berikutnya.
			</p>
		</div>
		<a class="btn btn-soft btn-sm shadow-none" href={resolve('/administrasi/absensi')}>
			<Icon name="left" />
			Kembali
		</a>
	</div>

	<div class="card bg-base-100 border-base-200 rounded-lg border p-4 shadow-sm print:hidden">
		<div class="grid gap-3 lg:grid-cols-[1fr_auto_auto] lg:items-end">
			<label class="form-control">
				<span class="label-text mb-1">Kelas</span>
				<select
					class="select select-bordered"
					value={data.kelasId ?? ''}
					onchange={(event) => updateKelas((event.currentTarget as HTMLSelectElement).value)}
				>
					{#each data.kelasList as kelas (kelas.id)}
						<option value={kelas.id}>{kelas.nama}{kelas.fase ? ` - ${kelas.fase}` : ''}</option>
					{/each}
				</select>
			</label>
			<form method="POST" action="?/previewClass">
				<input type="hidden" name="kelasId" value={data.kelasId ?? ''} />
				<input type="hidden" name="kelasLabel" value={kelasLabel} />
				<button class="btn btn-accent w-full shadow-none" type="submit" disabled={!data.kelasId}>
					<Icon name="eye" />
					Review Cetak Kelas
				</button>
			</form>
			<form method="POST" action="?/generateClass">
				<input type="hidden" name="kelasId" value={data.kelasId ?? ''} />
				<input type="hidden" name="kelasLabel" value={kelasLabel} />
				<button class="btn btn-primary w-full shadow-none" type="submit" disabled={!data.kelasId}>
					<Icon name="repeat" />
					Generate/Perbarui Massal
				</button>
			</form>
		</div>
		<p class="text-base-content/60 mt-3 text-xs">
			Gunakan Review Cetak untuk mencetak ulang kartu aktif tanpa membuat token baru. Generate hanya
			dipakai saat belum ada kartu atau ingin mengganti token QR.
		</p>
	</div>

	{#if form?.fail}
		<div class="alert alert-error print:hidden">
			<Icon name="error" />
			<span>{form.fail}</span>
		</div>
	{/if}

	{#if form?.cards?.length}
		<div class="card bg-base-100 border-base-200 rounded-lg border p-4 shadow-sm print:hidden">
			<div class="flex flex-wrap items-center justify-between gap-2">
				<div>
					<div class="font-semibold">
						{form.cards.length} kartu siap {form.preview ? 'direview dan dicetak' : 'dicetak'}
					</div>
					<div class="text-base-content/60 text-sm">
						{form.preview
							? 'Kartu diambil dari QR aktif tanpa generate token baru.'
							: 'Token baru dibuat. Setelah ini gunakan Review Cetak untuk cetak ulang.'}
						{form.skipped ? ` ${form.skipped} siswa belum memiliki QR yang bisa direview.` : ''}
					</div>
				</div>
				<button class="btn btn-accent shadow-none" type="button" onclick={printCards}>
					<Icon name="print" />
					Cetak Kartu Absensi
				</button>
			</div>
		</div>
	{/if}

	<div class="card bg-base-100 border-base-200 rounded-lg border p-4 shadow-sm print:hidden">
		<h3 class="mb-3 font-semibold">Daftar Siswa</h3>
		{#if !data.muridList.length}
			<div class="alert alert-info">
				<Icon name="info" />
				<span>Belum ada siswa pada kelas ini.</span>
			</div>
		{:else}
			<div class="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
				{#each data.muridList as murid (murid.id)}
					{@const downloadableCard = cardFromMurid(murid)}
					<div class="space-y-3">
						<article
							class="ring-base-300 relative mx-auto aspect-[64/100] w-full max-w-[320px] overflow-hidden rounded-lg bg-white text-center shadow-sm ring-1 [-webkit-print-color-adjust:exact] [print-color-adjust:exact]"
						>
							<div
								class="absolute top-0 left-0 h-[17%] w-[29%] bg-[#5f6a6b] [clip-path:polygon(0_0,100%_0,0_100%)]"
							></div>
							<div
								class="absolute top-0 left-[11%] h-[12%] w-[31%] bg-[#9f3438] [clip-path:polygon(28%_0,100%_0,58%_100%,0_100%)]"
							></div>
							<div
								class="absolute top-0 left-[38%] h-[9%] w-[38%] [background-image:radial-gradient(#9f3438_1.4px,transparent_1.6px)] [background-size:6px_6px] opacity-90 [clip-path:polygon(18%_0,100%_0,78%_100%,0_100%)]"
							></div>
							<div class="absolute top-[7%] right-[10%] h-[14%] w-2 rotate-45 bg-[#9f3438]"></div>
							<div class="absolute bottom-[27%] left-[7%] h-[13%] w-2 rotate-45 bg-[#9f3438]"></div>
							<div
								class="absolute right-0 bottom-0 h-[25%] w-[38%] bg-[#5f6a6b] [clip-path:polygon(100%_0,100%_100%,0_100%)]"
							></div>
							<div
								class="absolute right-[12%] bottom-0 h-[17%] w-[45%] bg-[#9f3438] [clip-path:polygon(33%_0,100%_0,66%_100%,0_100%)]"
							></div>
							<div
								class="absolute bottom-[7%] left-[7%] h-[10%] w-[40%] [background-image:radial-gradient(#9f3438_1.2px,transparent_1.4px)] [background-size:5px_5px] opacity-80 [clip-path:polygon(25%_0,100%_0,72%_100%,0_100%)]"
							></div>

							<div class="absolute inset-x-0 top-[12%] flex justify-center">
								<img
									class="h-16 w-16 object-contain"
									src={murid.logoUrl}
									alt={`Logo ${data.sekolahNama ?? 'Sekolah'}`}
								/>
							</div>

							<div class="absolute inset-x-5 top-[29%]">
								<div class="text-[1rem] font-black tracking-[0.28em] text-[#333333]">
									KARTU ABSENSI
								</div>
								<div
									class="mt-2 text-xs leading-5 font-black tracking-[0.16em] text-[#333333] uppercase"
								>
									{data.sekolahNama ?? 'Sekolah'}
								</div>
							</div>

							<div class="absolute inset-x-0 top-[47%] flex justify-center">
								{#if murid.qr?.previewable && murid.qr.qrDataUrl}
									<img
										class="h-[6.5rem] w-[6.5rem]"
										src={murid.qr.qrDataUrl}
										alt={`QR ${murid.nama}`}
									/>
								{:else}
									<div
										class="border-base-300 bg-base-100 text-base-content/60 flex h-[6.5rem] w-[6.5rem] items-center justify-center rounded-lg border text-center text-xs font-semibold"
									>
										{murid.qr ? 'Perlu Perbarui QR' : 'Belum Ada QR'}
									</div>
								{/if}
							</div>

							<div class="absolute inset-x-8 top-[70.5%] rounded bg-white/90 px-2 py-1">
								<div class="truncate text-sm font-bold tracking-[0.12em] text-[#333333] uppercase">
									{murid.nama}
								</div>
								<div class="mt-2 text-sm font-bold tracking-[0.12em] text-[#333333]">
									NIS {murid.nis}
								</div>
							</div>
						</article>

						<div class="mx-auto max-w-[320px] space-y-2">
							<div class="min-w-0 text-left">
								{#if murid.qr}
									<div class="badge badge-success">Aktif v{murid.qr.tokenVersion}</div>
									{#if !murid.qr.previewable}
										<div class="text-warning mt-1 text-xs">
											Perlu generate ulang agar bisa direview.
										</div>
									{/if}
								{:else}
									<div class="badge badge-ghost">Belum ada QR</div>
								{/if}
							</div>
							<div class="grid grid-cols-3 gap-2">
								{#if murid.qr?.previewable}
									<form method="POST" action="?/previewOne">
										<input type="hidden" name="muridId" value={murid.id} />
										<input type="hidden" name="kelasId" value={data.kelasId ?? ''} />
										<input type="hidden" name="kelasLabel" value={kelasLabel} />
										<button class="btn btn-xs btn-accent w-full shadow-none" type="submit">
											<Icon name="eye" />
											Review
										</button>
									</form>
								{:else}
									<div></div>
								{/if}
								{#if downloadableCard}
									<button
										class="btn btn-xs btn-primary w-full shadow-none"
										type="button"
										onclick={() => downloadCard(downloadableCard)}
									>
										<Icon name="download" />
										Download
									</button>
								{:else}
									<div></div>
								{/if}
								<form method="POST" action="?/generateOne">
									<input type="hidden" name="muridId" value={murid.id} />
									<input type="hidden" name="kelasId" value={data.kelasId ?? ''} />
									<input type="hidden" name="kelasLabel" value={kelasLabel} />
									<button class="btn btn-xs btn-soft w-full shadow-none" type="submit">
										<Icon name="repeat" />
										{murid.qr ? 'Perbarui' : 'Generate'}
									</button>
								</form>
							</div>
						</div>
					</div>
				{/each}
			</div>
		{/if}
	</div>

	{#if form?.cards?.length}
		<section class="grid gap-5 md:grid-cols-2 xl:grid-cols-3 print:grid-cols-3">
			{#each form.cards as card (card.muridId)}
				<div class="space-y-3 print:break-inside-avoid">
					<article
						class="ring-base-300 relative mx-auto aspect-[64/100] w-full max-w-[320px] overflow-hidden rounded-lg bg-white text-center shadow-sm ring-1 [-webkit-print-color-adjust:exact] [print-color-adjust:exact] print:shadow-none"
					>
						<div
							class="absolute top-0 left-0 h-[17%] w-[29%] bg-[#5f6a6b] [clip-path:polygon(0_0,100%_0,0_100%)]"
						></div>
						<div
							class="absolute top-0 left-[11%] h-[12%] w-[31%] bg-[#9f3438] [clip-path:polygon(28%_0,100%_0,58%_100%,0_100%)]"
						></div>
						<div
							class="absolute top-0 left-[38%] h-[9%] w-[38%] [background-image:radial-gradient(#9f3438_1.4px,transparent_1.6px)] [background-size:6px_6px] opacity-90 [clip-path:polygon(18%_0,100%_0,78%_100%,0_100%)]"
						></div>
						<div class="absolute top-[7%] right-[10%] h-[14%] w-2 rotate-45 bg-[#9f3438]"></div>
						<div class="absolute bottom-[27%] left-[7%] h-[13%] w-2 rotate-45 bg-[#9f3438]"></div>
						<div
							class="absolute right-0 bottom-0 h-[25%] w-[38%] bg-[#5f6a6b] [clip-path:polygon(100%_0,100%_100%,0_100%)]"
						></div>
						<div
							class="absolute right-[12%] bottom-0 h-[17%] w-[45%] bg-[#9f3438] [clip-path:polygon(33%_0,100%_0,66%_100%,0_100%)]"
						></div>
						<div
							class="absolute bottom-[7%] left-[7%] h-[10%] w-[40%] [background-image:radial-gradient(#9f3438_1.2px,transparent_1.4px)] [background-size:5px_5px] opacity-80 [clip-path:polygon(25%_0,100%_0,72%_100%,0_100%)]"
						></div>

						<div class="absolute inset-x-0 top-[12%] flex justify-center">
							<img
								class="h-16 w-16 object-contain"
								src={card.logoUrl}
								alt={`Logo ${card.sekolah}`}
							/>
						</div>

						<div class="absolute inset-x-5 top-[29%]">
							<div class="text-[1rem] font-black tracking-[0.28em] text-[#333333]">
								KARTU ABSENSI
							</div>
							<div
								class="mt-2 text-xs leading-5 font-black tracking-[0.16em] text-[#333333] uppercase"
							>
								{card.sekolah}
							</div>
						</div>

						<div class="absolute inset-x-0 top-[47%] flex justify-center">
							<img class="h-[6.5rem] w-[6.5rem]" src={card.qrDataUrl} alt={`QR ${card.nama}`} />
						</div>

						<div class="absolute inset-x-8 top-[70.5%] rounded bg-white/90 px-2 py-1">
							<div class="truncate text-sm font-bold tracking-[0.12em] text-[#333333] uppercase">
								{card.nama}
							</div>
							<div class="mt-2 text-sm font-bold tracking-[0.12em] text-[#333333]">
								NIS {card.nis}
							</div>
						</div>
					</article>
					<div class="flex justify-end gap-2 print:hidden">
						<button
							class="btn btn-primary btn-sm shadow-none"
							type="button"
							onclick={() => downloadCard(card)}
						>
							<Icon name="download" />
							Download Kartu Absensi
						</button>
					</div>
				</div>
			{/each}
		</section>
	{/if}
</div>
