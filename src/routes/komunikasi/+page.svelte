<script lang="ts">
	import Icon from '$lib/components/icon.svelte';
	let { data, form } = $props();
	let templateOpen = $state(false);
	let draftOpen = $state(false);
	let selectedTemplate = $state('');
	let channel = $state('internal');
	let audience = $state('semua');
	let subject = $state('');
	let body = $state('');
	const date = (value: string | null) => (value ? new Date(value).toLocaleString('id-ID') : '-');
	function applyTemplate() {
		const template = data.templates.find((item) => String(item.id) === selectedTemplate);
		if (!template) return;
		channel = template.channel;
		audience = template.audience;
		subject = template.subject || '';
		body = template.body;
	}
</script>

<div class="space-y-5">
	<header class="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
		<div>
			<h2 class="text-2xl font-bold">Komunikasi Terintegrasi</h2>
			<p class="text-base-content/65 text-sm">
				Template, persetujuan, dan catatan pengiriman informasi sekolah.
			</p>
		</div>
		{#if data.canManage}<div class="flex gap-2">
				<button class="btn btn-soft" type="button" onclick={() => (templateOpen = true)}
					><Icon name="plus" /> Template</button
				><button class="btn btn-primary" type="button" onclick={() => (draftOpen = true)}
					><Icon name="plus" /> Buat Draf</button
				>
			</div>{/if}
	</header>
	<div class="alert alert-info">
		<Icon name="info" /><span
			>Email dan WhatsApp belum dikirim otomatis. Sistem menyimpan draf, persetujuan, dan hasil
			pengiriman manual agar tidak ada pesan massal terkirim tanpa izin.</span
		>
	</div>
	{#if form?.message}<div class="alert alert-success">{form.message}</div>{/if}
	<section class="overflow-x-auto rounded-lg border border-base-300 bg-base-100 shadow-sm">
		<table class="table">
			<thead
				><tr
					><th>Pesan</th><th>Tujuan</th><th>Status</th><th>Waktu</th><th class="text-right">Aksi</th
					></tr
				></thead
			><tbody
				>{#each data.queue as item}<tr
						><td
							><strong>{item.subject || 'Tanpa subjek'}</strong>
							<div class="mt-1 max-w-xl line-clamp-2 text-sm opacity-65">{item.body}</div></td
						><td
							><span class="badge badge-outline">{item.channel}</span>
							<div class="mt-1 text-sm">
								{item.audience}{item.recipient ? ` · ${item.recipient}` : ''}
							</div></td
						><td
							><span
								class="badge"
								class:badge-warning={item.status === 'pending_approval'}
								class:badge-success={item.status === 'sent'}
								>{item.status.replaceAll('_', ' ')}</span
							></td
						><td>{date(item.createdAt)}</td><td
							><div class="flex justify-end gap-1">
								{#if item.status === 'draft' && data.canManage}<form
										method="POST"
										action="?/request"
									>
										<input type="hidden" name="id" value={item.id} /><button
											class="btn btn-sm btn-primary"
											type="submit">Ajukan</button
										>
									</form>{/if}{#if item.status === 'pending_approval' && data.canApprove}<form
										method="POST"
										action="?/approve"
									>
										<input type="hidden" name="id" value={item.id} /><button
											class="btn btn-sm btn-success"
											type="submit">Setujui</button
										>
									</form>{/if}{#if item.status === 'approved' && data.canApprove}<form
										method="POST"
										action="?/mark-sent"
									>
										<input type="hidden" name="id" value={item.id} /><button
											class="btn btn-sm btn-success btn-soft"
											type="submit">Tandai Terkirim</button
										>
									</form>{/if}{#if !['sent', 'cancelled'].includes(item.status) && data.canManage}<form
										method="POST"
										action="?/cancel"
									>
										<input type="hidden" name="id" value={item.id} /><button
											class="btn btn-sm btn-error btn-soft"
											type="submit">Batal</button
										>
									</form>{/if}
							</div></td
						></tr
					>{:else}<tr
						><td colspan="5" class="py-12 text-center opacity-60">Belum ada antrean komunikasi.</td
						></tr
					>{/each}</tbody
			>
		</table>
	</section>
</div>

{#if templateOpen}<div class="modal modal-open">
		<div class="modal-box">
			<h3 class="text-xl font-bold">Template Komunikasi</h3>
			<form method="POST" action="?/template-create" class="mt-4 space-y-3">
				<input
					class="input input-bordered w-full"
					name="name"
					placeholder="Nama template"
					required
				/>
				<div class="grid gap-3 sm:grid-cols-2">
					<select class="select select-bordered" name="channel"
						><option value="internal">Internal</option><option value="email">Email</option><option
							value="whatsapp">WhatsApp</option
						></select
					><select class="select select-bordered" name="audience"
						><option value="semua">Semua</option><option value="guru">Guru</option><option
							value="wali_kelas">Wali kelas</option
						><option value="wali_asuh">Wali asuh</option><option value="wali_asrama"
							>Wali asrama</option
						><option value="wali_murid">Wali murid</option><option value="individu">Individu</option
						></select
					>
				</div>
				<input
					class="input input-bordered w-full"
					name="subject"
					placeholder="Subjek (opsional)"
				/><textarea
					class="textarea textarea-bordered min-h-36 w-full"
					name="body"
					placeholder="Isi pemberitahuan"
					required></textarea>
				<div class="modal-action">
					<button class="btn" type="button" onclick={() => (templateOpen = false)}>Batal</button
					><button class="btn btn-primary" type="submit">Simpan</button>
				</div>
			</form>
		</div>
		<button class="modal-backdrop" type="button" onclick={() => (templateOpen = false)}
			>Tutup</button
		>
	</div>{/if}

{#if draftOpen}<div class="modal modal-open">
		<div class="modal-box max-w-2xl">
			<h3 class="text-xl font-bold">Buat Draf Komunikasi</h3>
			<form method="POST" action="?/queue-create" class="mt-4 space-y-3">
				<label class="form-control"
					><span class="label-text mb-1">Gunakan template</span><select
						class="select select-bordered"
						name="templateId"
						bind:value={selectedTemplate}
						onchange={applyTemplate}
						><option value="">Tanpa template</option>{#each data.templates as template}<option
								value={template.id}>{template.name}</option
							>{/each}</select
					></label
				>
				<div class="grid gap-3 sm:grid-cols-2">
					<select class="select select-bordered" name="channel" bind:value={channel}
						><option value="internal">Internal</option><option value="email">Email</option><option
							value="whatsapp">WhatsApp</option
						></select
					><select class="select select-bordered" name="audience" bind:value={audience}
						><option value="semua">Semua</option><option value="guru">Guru</option><option
							value="wali_kelas">Wali kelas</option
						><option value="wali_asuh">Wali asuh</option><option value="wali_asrama"
							>Wali asrama</option
						><option value="wali_murid">Wali murid</option><option value="individu">Individu</option
						></select
					>
				</div>
				{#if audience === 'individu'}<input
						class="input input-bordered w-full"
						name="recipient"
						placeholder="Email atau nomor penerima"
						required
					/>{/if}<input
					class="input input-bordered w-full"
					name="subject"
					bind:value={subject}
					placeholder="Subjek (opsional)"
				/><textarea
					class="textarea textarea-bordered min-h-40 w-full"
					name="body"
					bind:value={body}
					placeholder="Isi pemberitahuan"
					required></textarea><label
					class="flex items-start gap-3 rounded-lg border border-base-300 p-3"
					><input
						class="checkbox mt-0.5"
						type="checkbox"
						name="containsSensitiveData"
						value="1"
					/><span
						><strong>Mengandung data sensitif</strong><span class="block text-xs opacity-60"
							>Pesan dengan nilai atau data sensitif akan ditolak sampai kebijakan sekolah tersedia.</span
						></span
					></label
				>
				<div class="modal-action">
					<button class="btn" type="button" onclick={() => (draftOpen = false)}>Batal</button
					><button class="btn btn-primary" type="submit">Simpan Draf</button>
				</div>
			</form>
		</div>
		<button class="modal-backdrop" type="button" onclick={() => (draftOpen = false)}>Tutup</button>
	</div>{/if}
