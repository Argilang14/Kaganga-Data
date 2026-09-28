<script lang="ts">
	import Icon from '$lib/components/icon.svelte';
	let { data, form } = $props();
	let open = $state(false);
	let editing = $state<any>(null);
</script>

<div class="space-y-5">
	<header class="flex items-end justify-between">
		<div>
			<a class="link text-sm" href="/portal-wali">Portal Wali Murid</a>
			<h2 class="text-2xl font-bold">Pengaturan Akun Wali</h2>
			<p class="text-sm opacity-60">Satu akun dapat dihubungkan dengan lebih dari satu anak.</p>
		</div>
		<button
			class="btn btn-primary"
			type="button"
			onclick={() => {
				editing = null;
				open = true;
			}}><Icon name="plus" /> Tambah Akun</button
		>
	</header>
	{#if form?.fail}<div class="alert alert-error">{form.fail}</div>{/if}{#if form?.message}<div
			class="alert alert-success"
		>
			{form.message}
		</div>{/if}
	<div class="overflow-x-auto rounded-lg border border-base-300 bg-base-100 shadow-sm">
		<table class="table">
			<thead
				><tr
					><th>Nama Pengguna</th><th>Anak Terhubung</th><th>Status Sandi</th><th class="text-right"
						>Aksi</th
					></tr
				></thead
			><tbody
				>{#each data.accounts as account}<tr
						><td class="font-semibold">{account.username}</td><td
							><div class="flex flex-wrap gap-1">
								{#each account.children as child}<span class="badge badge-outline"
										>{child.nama} · {child.hubungan}</span
									>{/each}
							</div></td
						><td>{account.mustChangePassword ? 'Wajib diganti' : 'Aktif'}</td><td
							><div class="flex justify-end gap-1">
								<button
									class="btn btn-soft btn-sm"
									type="button"
									onclick={() => {
										editing = account;
										open = true;
									}}><Icon name="edit" /></button
								>
								<form
									method="POST"
									action="?/delete"
									onsubmit={(event) => {
										if (!confirm(`Hapus akun ${account.username}?`)) event.preventDefault();
									}}
								>
									<input type="hidden" name="id" value={account.id} /><button
										class="btn btn-error btn-soft btn-sm"
										type="submit"><Icon name="del" /></button
									>
								</form>
							</div></td
						></tr
					>{:else}<tr
						><td colspan="4" class="py-12 text-center opacity-60">Belum ada akun wali murid.</td
						></tr
					>{/each}</tbody
			>
		</table>
	</div>
</div>
{#if open}<div class="modal modal-open">
		<div class="modal-box max-w-2xl">
			<h3 class="text-xl font-bold">{editing ? 'Atur Anak' : 'Tambah Akun Wali'}</h3>
			<form method="POST" action={editing ? '?/updateChildren' : '?/create'} class="mt-4 space-y-4">
				{#if editing}<input type="hidden" name="userId" value={editing.id} />
					<div class="rounded-md bg-base-200 p-3 font-semibold">{editing.username}</div>{:else}<div
						class="grid gap-3 sm:grid-cols-2"
					>
						<label class="form-control"
							><span class="label-text mb-1">Nama Pengguna</span><input
								class="input input-bordered"
								name="username"
								minlength="3"
								required
							/></label
						><label class="form-control"
							><span class="label-text mb-1">Kata Sandi Awal</span><input
								class="input input-bordered"
								name="password"
								type="password"
								minlength="8"
								required
							/></label
						>
					</div>{/if}<label class="form-control"
					><span class="label-text mb-1">Hubungan</span><input
						class="input input-bordered"
						name="hubungan"
						value={editing?.children?.[0]?.hubungan ?? 'Wali Murid'}
						required
					/></label
				>
				<fieldset>
					<legend class="mb-2 font-semibold">Pilih Anak</legend>
					<div class="max-h-72 space-y-1 overflow-auto rounded-md border border-base-300 p-2">
						{#each data.students as student}<label
								class="flex cursor-pointer items-center gap-3 rounded-md p-2 hover:bg-base-200"
								><input
									class="checkbox checkbox-sm"
									type="checkbox"
									name="muridIds"
									value={student.id}
									checked={editing?.children?.some((item: any) => item.muridId === student.id)}
								/><span
									><strong>{student.nama}</strong><span class="block text-xs opacity-60"
										>{student.nis} · {student.kelas}</span
									></span
								></label
							>{/each}
					</div>
				</fieldset>
				<div class="modal-action">
					<button class="btn" type="button" onclick={() => (open = false)}>Batal</button><button
						class="btn btn-primary"
						type="submit"><Icon name="save" /> Simpan</button
					>
				</div>
			</form>
		</div>
		<button class="modal-backdrop" type="button" onclick={() => (open = false)}>Tutup</button>
	</div>{/if}
