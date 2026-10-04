<script lang="ts">
	import { onMount } from 'svelte';
	import Icon from '$lib/components/icon.svelte';
	import {
		bulkUserRoles,
		bulkUserRoleLabels,
		bulkCredentialsCsv,
		BULK_USER_LIMIT,
		type BulkUserRole,
		type BulkUserPreview,
		type BulkUserResult,
		type BulkUserCandidate
	} from '$lib/bulk-user';
	import { groupedUserPermissions } from '../../../routes/pengguna/permissions';
	let { open = $bindable(false), onSaved }: { open?: boolean; onSaved?: () => Promise<void> } =
		$props();
	let dialog = $state<HTMLDialogElement>();
	let role = $state<BulkUserRole>('user');
	let preview = $state<BulkUserPreview | null>(null);
	let result = $state<BulkUserResult | null>(null);
	let stage = $state<'choose' | 'confirm' | 'result'>('choose');
	let selected = $state<number[]>([]);
	let reviewed = $state<number[]>([]);
	let loading = $state(false);
	let saving = $state(false);
	let problem = $state('');
	let search = $state('');
	let confirmed = $state(false);
	let showPasswords = $state(false);
	let downloaded = $state(false);
	let controller: AbortController | null = null;
	const statusLabels = {
		ready: 'Siap',
		review: 'Perlu ditinjau',
		blocked: 'Belum lengkap',
		existing: 'Sudah punya akun'
	};
	const labels = Object.fromEntries(
		Object.entries(groupedUserPermissions).flatMap(([group, definition]) =>
			definition.values.map(([key, label]) => [`${group}_${key}`, label])
		)
	);
	const visible = $derived(
		preview?.candidates.filter(
			(row) =>
				row.nama.toLowerCase().includes(search.toLowerCase()) ||
				row.username.includes(search.toLowerCase())
		) ?? []
	);
	const picked = $derived(
		preview?.candidates.filter((row) => selected.includes(row.pegawaiId)) ?? []
	);
	const needReview = $derived(picked.filter((row) => row.status === 'review'));
	const canContinue = $derived(
		picked.length > 0 &&
			picked.length <= BULK_USER_LIMIT &&
			needReview.every((row) => reviewed.includes(row.pegawaiId)) &&
			!loading &&
			!saving
	);
	const readyCount = $derived(
		preview?.candidates.filter((row) => row.status === 'ready' || row.status === 'review').length ??
			0
	);

	function erase() {
		controller?.abort();
		controller = null;
		preview = null;
		result = null;
		selected = [];
		reviewed = [];
		search = '';
		problem = '';
		stage = 'choose';
		confirmed = false;
		showPasswords = false;
		downloaded = false;
	}
	function close() {
		if (!saving) {
			open = false;
			dialog?.close();
			erase();
		}
	}
	$effect(() => {
		if (!dialog) return;
		if (open && !dialog.open) {
			erase();
			dialog.showModal();
			void loadPreview();
		}
		if (!open && dialog.open) {
			dialog.close();
			erase();
		}
	});
	onMount(() => {
		const clear = () => {
			open = false;
			erase();
		};
		window.addEventListener('pagehide', clear);
		return () => {
			window.removeEventListener('pagehide', clear);
			controller?.abort();
		};
	});
	async function loadPreview() {
		controller?.abort();
		const requestController = new AbortController();
		controller = requestController;
		loading = true;
		preview = null;
		selected = [];
		reviewed = [];
		problem = '';
		stage = 'choose';
		confirmed = false;
		try {
			const response = await fetch(`/api/pengguna/akun-massal?role=${role}`, {
				cache: 'no-store',
				signal: requestController.signal
			});
			const body = await response.json();
			if (!response.ok) throw new Error(body.message ?? 'Pratinjau tidak dapat dimuat.');
			if (!requestController.signal.aborted) preview = body;
		} catch (cause) {
			if (!requestController.signal.aborted)
				problem = cause instanceof Error ? cause.message : 'Pratinjau tidak dapat dimuat.';
		} finally {
			if (controller === requestController) loading = false;
		}
	}
	function toggle(id: number) {
		selected = selected.includes(id) ? selected.filter((value) => value !== id) : [...selected, id];
	}
	function toggleAll() {
		const ids = visible
			.filter((row) => row.status === 'ready' || row.status === 'review')
			.slice(0, BULK_USER_LIMIT)
			.map((row) => row.pegawaiId);
		selected = ids.every((id) => selected.includes(id)) ? [] : ids;
	}
	function scope(row: BulkUserCandidate) {
		return row.role === 'user'
			? `${row.classes.join(', ') || '-'}; ${row.subjects.join(', ') || 'Belum ada mapel'}`
			: `${row.studentIds.length} murid; ${row.classes.join(', ') || '-'}`;
	}
	async function create() {
		if (!confirmed || !canContinue) return;
		saving = true;
		problem = '';
		try {
			const response = await fetch('/api/pengguna/akun-massal', {
				method: 'POST',
				cache: 'no-store',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					role,
					selected: picked.map((row) => ({
						pegawaiId: row.pegawaiId,
						fingerprint: row.fingerprint
					})),
					reviewedIds: reviewed,
					confirm: true
				})
			});
			const body = await response.json();
			if (!response.ok) throw new Error(body.message ?? 'Pembuatan akun tidak berhasil.');
			result = body;
			stage = 'result';
			preview = null;
			selected = [];
			reviewed = [];
			confirmed = false;
			try {
				await onSaved?.();
			} catch {
				problem = 'Akun berhasil dibuat, tetapi daftar pengguna belum termuat ulang.';
			}
		} catch (cause) {
			problem = cause instanceof Error ? cause.message : 'Pembuatan akun tidak berhasil.';
		} finally {
			saving = false;
		}
	}
	function download() {
		if (!result?.created.length || downloaded) return;
		const url = URL.createObjectURL(
			new Blob([bulkCredentialsCsv(result.created)], { type: 'text/csv;charset=utf-8' })
		);
		const link = document.createElement('a');
		link.href = url;
		link.download = `akun-awal-${role}-${new Date().toISOString().slice(0, 10)}.csv`;
		link.click();
		downloaded = true;
		setTimeout(() => URL.revokeObjectURL(url), 1000);
	}
</script>

<dialog
	id="bulk-user-modal"
	aria-labelledby="bulk-user-title"
	bind:this={dialog}
	class="modal"
	oncancel={(event) => {
		event.preventDefault();
		close();
	}}
	onclose={() => {
		if (!saving) {
			open = false;
			erase();
		}
	}}
>
	<div class="modal-box flex max-h-[92dvh] w-[96vw] max-w-5xl flex-col gap-4 rounded-lg p-4 sm:p-6">
		<header class="flex items-center justify-between gap-3">
			<h2 id="bulk-user-title" class="text-xl font-bold">
				{stage === 'result' ? 'Hasil Pembuatan Akun' : 'Buat Akun Massal'}
			</h2>
			<button
				type="button"
				class="btn btn-ghost btn-square btn-sm"
				disabled={saving}
				aria-disabled={saving}
				title="Tutup"
				onclick={close}><Icon name="close" /></button
			>
		</header>
		{#if problem}<div class="alert alert-error text-sm" role="alert">
				<Icon name="warning" /><span>{problem}</span>
			</div>{/if}
		{#if stage === 'choose'}
			<div class="grid gap-3 sm:grid-cols-[12rem_minmax(0,1fr)_auto]">
				<label class="flex flex-col gap-1"
					><span class="text-sm font-semibold">Jenis Pegawai</span>
					<select
						class="select w-full"
						bind:value={role}
						disabled={saving}
						onchange={() => void loadPreview()}
					>
						{#each bulkUserRoles as value (value)}<option {value}
								>{bulkUserRoleLabels[value]}</option
							>{/each}
					</select>
				</label>
				<label class="flex flex-col gap-1"
					><span class="text-sm font-semibold">Nama atau Username</span><span class="input w-full"
						><Icon name="search" /><input bind:value={search} placeholder="Cari pegawai" /></span
					></label
				>
				<button
					class="btn btn-soft btn-square self-end"
					type="button"
					disabled={loading}
					title="Muat ulang pratinjau"
					onclick={() => void loadPreview()}><Icon name="repeat" /></button
				>
			</div>
			{#if loading}<div class="flex justify-center py-8">
					<span class="loading loading-spinner" aria-label="Memuat pegawai"></span>
				</div>
			{:else if preview}
				<div class="flex flex-wrap gap-2 text-sm text-base-content/70">
					<span>{preview.periode}</span><span class="badge badge-ghost"
						>{preview.candidates.length} pegawai</span
					><span class="badge badge-success badge-outline">{readyCount} dapat dipilih</span><span
						class="badge badge-primary badge-outline">{picked.length} dipilih</span
					>
				</div>
				<div class="min-h-0 overflow-auto rounded-lg border border-base-300">
					<table class="table table-sm">
						<thead
							><tr
								><th
									><input
										type="checkbox"
										class="checkbox checkbox-sm"
										aria-label="Pilih semua pegawai yang dapat dibuatkan akun"
										checked={visible.some(
											(row) => row.status === 'ready' || row.status === 'review'
										) &&
											visible
												.filter((row) => row.status === 'ready' || row.status === 'review')
												.every((row) => selected.includes(row.pegawaiId))}
										onchange={toggleAll}
									/></th
								><th>Pegawai</th><th>Nama Pengguna</th><th>Cakupan</th><th>Status</th></tr
							></thead
						>
						<tbody>
							{#each visible as row (row.pegawaiId)}
								<tr
									><td
										><input
											class="checkbox checkbox-sm"
											type="checkbox"
											aria-label={`Pilih ${row.nama}`}
											disabled={row.status === 'blocked' ||
												row.status === 'existing' ||
												(!selected.includes(row.pegawaiId) && selected.length >= BULK_USER_LIMIT)}
											checked={selected.includes(row.pegawaiId)}
											onchange={() => toggle(row.pegawaiId)}
										/></td
									>
									<td class="min-w-40"
										><div class="font-semibold">{row.nama}</div>
										<span class="text-xs text-base-content/60">{bulkUserRoleLabels[row.role]}</span
										></td
									>
									<td class="break-all"
										>{row.accountNames.length ? row.accountNames.join(', ') : row.username}</td
									>
									<td class="min-w-40 max-w-64 whitespace-normal">{scope(row)}</td>
									<td class="min-w-44 max-w-72 whitespace-normal"
										><span
											class="badge badge-sm"
											class:badge-success={row.status === 'ready'}
											class:badge-warning={row.status === 'review'}
											class:badge-error={row.status === 'blocked'}>{statusLabels[row.status]}</span
										>
										{#each row.reasons as reason (reason)}<p
												class="mt-1 text-xs text-base-content/70"
											>
												{reason}
											</p>{/each}
										{#if row.status === 'review' && selected.includes(row.pegawaiId)}<label
												class="mt-2 flex items-start gap-2"
												><input
													class="checkbox checkbox-sm"
													type="checkbox"
													aria-label={`Penugasan ${row.nama} sudah ditinjau`}
													checked={reviewed.includes(row.pegawaiId)}
													onchange={() => {
														reviewed = reviewed.includes(row.pegawaiId)
															? reviewed.filter((id) => id !== row.pegawaiId)
															: [...reviewed, row.pegawaiId];
													}}
												/><span class="text-xs">Penugasan sudah ditinjau</span></label
											>{/if}
									</td>
								</tr>
							{:else}<tr
									><td colspan="5" class="py-8 text-center text-base-content/60"
										>Tidak ada pegawai yang sesuai.</td
									></tr
								>{/each}
						</tbody>
					</table>
				</div>
			{/if}
			<footer class="flex shrink-0 justify-end gap-2">
				<button class="btn btn-soft" type="button" onclick={close}>Batal</button><button
					class="btn btn-primary"
					type="button"
					disabled={!canContinue}
					aria-disabled={!canContinue}
					onclick={() => {
						stage = 'confirm';
						confirmed = false;
					}}><Icon name="eye" /> Pratinjau ({picked.length})</button
				>
			</footer>
		{:else if stage === 'confirm'}
			<div class="min-h-0 overflow-auto space-y-3">
				{#each picked as row (row.pegawaiId)}<section class="border-b border-base-300 pb-3">
						<div class="flex flex-wrap items-center justify-between gap-2">
							<h3 class="font-semibold">{row.nama}</h3>
							<code class="text-sm">{row.username}</code>
						</div>
						<p class="mt-1 text-sm">{bulkUserRoleLabels[row.role]} - {scope(row)}</p>
						<p class="text-sm text-base-content/65">Jabatan Akses: Tidak diberikan</p>
						<div class="mt-2 flex flex-wrap gap-1">
							{#each row.permissions as permission (permission)}<span
									class="badge badge-outline badge-sm h-auto max-w-full whitespace-normal py-1"
									>{labels[permission] ?? permission}</span
								>{/each}
						</div>
					</section>{/each}
			</div>
			<label class="flex shrink-0 items-start gap-2"
				><input
					class="checkbox checkbox-sm"
					type="checkbox"
					bind:checked={confirmed}
					disabled={saving}
				/><span class="text-sm"
					>Saya mengonfirmasi identitas, role dan penugasan {picked.length} pegawai ini.</span
				></label
			>
			<footer class="flex shrink-0 flex-wrap justify-end gap-2">
				<button
					type="button"
					class="btn btn-soft"
					disabled={saving}
					onclick={() => {
						stage = 'choose';
						confirmed = false;
					}}>Kembali</button
				><button
					type="button"
					class="btn btn-primary"
					disabled={!confirmed || !canContinue}
					aria-disabled={!confirmed || !canContinue}
					onclick={() => void create()}
					>{#if saving}<span class="loading loading-spinner loading-sm"></span>{:else}<Icon
							name="plus"
						/>{/if} Buat {picked.length} Akun</button
				>
			</footer>
		{:else if result}
			<div class="flex flex-wrap gap-2">
				<span class="badge badge-success">{result.created.length} berhasil</span><span
					class="badge badge-ghost">{result.skipped.length} dilewati</span
				>
			</div>
			{#if result.created.length}
				<div class="alert alert-warning text-sm">
					<Icon name="warning" /><span
						>Sandi sementara hanya tersedia pada hasil ini. Setelah ditutup, sandi tidak dapat
						ditampilkan kembali. Bagikan secara pribadi; pengguna wajib menggantinya saat login
						pertama.</span
					>
				</div>
				<div class="flex flex-wrap items-center justify-between gap-2">
					<label class="flex items-center gap-2 text-sm"
						><input type="checkbox" class="toggle toggle-sm" bind:checked={showPasswords} /> Tampilkan
						sandi sementara</label
					><button
						class="btn btn-soft btn-sm"
						type="button"
						disabled={downloaded}
						aria-disabled={downloaded}
						onclick={download}
						><Icon name="download" />
						{downloaded ? 'Daftar sudah diunduh' : 'Unduh Daftar Awal'}</button
					>
				</div>
				<div class="min-h-0 overflow-auto">
					<table class="table table-sm">
						<thead><tr><th>Pegawai</th><th>Nama Pengguna</th><th>Sandi Sementara</th></tr></thead
						><tbody
							>{#each result.created as row (row.id)}<tr
									><td>{row.nama}</td><td><code>{row.username}</code></td><td
										><code>{showPasswords ? row.password : '********'}</code></td
									></tr
								>{/each}</tbody
						>
					</table>
				</div>
			{/if}
			{#each result.skipped as row (row.pegawaiId)}<p class="text-sm text-base-content/65">
					{row.nama}: {row.reason}
				</p>{/each}
			<footer class="flex shrink-0 justify-end">
				<button class="btn btn-primary" type="button" onclick={close}>Selesai</button>
			</footer>
		{/if}
	</div>
</dialog>
