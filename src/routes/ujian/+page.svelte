<script lang="ts">
	import Icon from '$lib/components/icon.svelte';
	let { data, form } = $props();
	let showSessionForm = $state(false);
	let editing = $state<any>(null);
	let selectedYearId = $state<number>(data.years.find((item: any) => item.isAktif)?.id ?? data.years[0]?.id ?? 0);
	const selectedYear = $derived(data.years.find((item: any) => item.id === selectedYearId));
	const selectedSession = $derived(data.sessions.find((item: any) => item.id === data.selectedSessionId));

	function openSession(item: any = null) {
		editing = item;
		selectedYearId = item?.tahunAjaranId ?? data.years.find((year: any) => year.isAktif)?.id ?? data.years[0]?.id ?? 0;
		showSessionForm = true;
	}
</script>

<div class="space-y-5">
	<header class="flex flex-wrap items-end justify-between gap-3">
		<div>
			<h2 class="text-2xl font-bold">Sesi Ujian</h2>
			<p class="text-base-content/65 text-sm">Siapkan peserta, nomor, ruang, dan akun LMS tanpa mengubah data utama murid.</p>
		</div>
		<button class="btn btn-primary" type="button" onclick={() => openSession()}><Icon name="plus" /> Tambah Sesi</button>
	</header>
	{#if form?.fail}<div class="alert alert-error">{form.fail}</div>{/if}
	{#if form?.message}<div class="alert alert-success">{form.message}</div>{/if}

	<div class="grid gap-5 xl:grid-cols-[300px_minmax(0,1fr)]">
		<aside class="card bg-base-100 rounded-lg shadow-md">
			<div class="card-body p-4">
				<h3 class="font-bold">Daftar Sesi</h3>
				<div class="space-y-2">
					{#each data.sessions as item}
						<a href={`/ujian?session_id=${item.id}`} class:btn-primary={item.id === data.selectedSessionId} class="btn h-auto w-full justify-start py-3 text-left shadow-none">
							<span class="min-w-0"><span class="block truncate font-semibold">{item.singkatan || item.nama}</span><span class="block text-xs font-normal opacity-65">{item.tahunAjaran} · {item.participantCount} peserta</span></span>
						</a>
					{:else}<p class="py-8 text-center text-sm opacity-60">Belum ada sesi ujian.</p>{/each}
				</div>
			</div>
		</aside>

		<section class="card bg-base-100 rounded-lg shadow-md">
			<div class="card-body p-4 sm:p-5">
				{#if selectedSession}
					<div class="flex flex-wrap items-start justify-between gap-3 border-b border-base-300 pb-4">
						<div><h3 class="text-xl font-bold">{selectedSession.nama}</h3><p class="text-sm opacity-65">{selectedSession.tahunAjaran} · {selectedSession.semester || 'Semua semester'} · {selectedSession.status}</p></div>
						<div class="flex flex-wrap gap-2"><a class="btn btn-primary btn-sm" href={`/cetak?dokumen=kartu-ujian&session_id=${selectedSession.id}`}><Icon name="print" /> Cetak Kartu</a><button class="btn btn-soft btn-sm" onclick={() => openSession(selectedSession)}><Icon name="edit" /> Ubah</button><form method="POST" action="?/deleteSession" onsubmit={(event) => !confirm('Hapus sesi dan seluruh pesertanya?') && event.preventDefault()}><input type="hidden" name="id" value={selectedSession.id} /><button class="btn btn-error btn-soft btn-sm"><Icon name="del" /></button></form></div>
					</div>

					<form method="POST" action="?/addClass" class="mt-4 grid items-end gap-3 rounded-lg border border-base-300 bg-base-200/35 p-4 sm:grid-cols-[minmax(0,1fr)_180px_auto]">
						<input type="hidden" name="sessionId" value={selectedSession.id} />
						<label class="form-control"><span class="label-text mb-1">Tambahkan Murid dari Kelas</span><select class="select select-bordered bg-base-100" name="classId" required><option value="">Pilih kelas</option>{#each data.classes as item}<option value={item.id}>{item.nama} ({item.muridCount} murid)</option>{/each}</select></label>
						<label class="form-control"><span class="label-text mb-1">Ruang Awal</span><input class="input input-bordered bg-base-100" name="room" placeholder="Contoh: 01" /></label>
						<button class="btn btn-primary"><Icon name="plus" /> Tambahkan</button>
					</form>

					<div class="mt-4 overflow-x-auto rounded-lg border border-base-300">
						<table class="table"><thead><tr><th>Peserta</th><th>No. Peserta</th><th>Ruang</th><th>Akun LMS</th><th class="w-24">Aksi</th></tr></thead><tbody>
							{#each data.participants as item}
								<tr><td><div class="font-semibold">{item.nama}</div><div class="text-xs opacity-60">{item.kelas || '-'} · NISN {item.nisn || '-'}</div></td><td colspan="3" class="p-0"><form id={`participant-${item.id}`} method="POST" action="?/updateParticipant" class="grid min-w-[600px] grid-cols-[150px_120px_1fr_1fr] gap-2 p-3"><input type="hidden" name="id" value={item.id} /><input class="input input-bordered input-sm" name="nomorPeserta" value={item.nomorPeserta ?? ''} aria-label="Nomor peserta" /><input class="input input-bordered input-sm" name="ruang" value={item.ruang ?? ''} aria-label="Ruang" /><input class="input input-bordered input-sm" name="usernameLms" value={item.usernameLms ?? ''} aria-label="Username LMS" /><input class="input input-bordered input-sm" type="password" name="passwordLms" placeholder={item.passwordSet ? 'Tersimpan; isi untuk mengganti' : 'Password LMS'} aria-label="Password LMS" /></form></td><td><div class="flex gap-1"><button class="btn btn-primary btn-soft btn-sm" type="submit" form={`participant-${item.id}`} title="Simpan peserta"><Icon name="save" /></button><form method="POST" action="?/deleteParticipant"><input type="hidden" name="id" value={item.id} /><button class="btn btn-error btn-soft btn-sm" title="Hapus peserta"><Icon name="del" /></button></form></div></td></tr>
							{:else}<tr><td colspan="5" class="py-12 text-center opacity-60">Belum ada peserta. Tambahkan satu kelas untuk memulai.</td></tr>{/each}
						</tbody></table>
					</div>
				{:else}<div class="py-20 text-center"><Icon name="calendar" /><h3 class="mt-3 text-lg font-bold">Belum ada sesi ujian</h3><p class="text-sm opacity-60">Buat sesi agar kartu peserta dapat disiapkan.</p></div>{/if}
			</div>
		</section>
	</div>
</div>

{#if showSessionForm}
	<div class="modal modal-open"><div class="modal-box max-w-3xl"><h3 class="text-xl font-bold">{editing ? 'Ubah' : 'Tambah'} Sesi Ujian</h3><form method="POST" action="?/saveSession" class="mt-4 grid gap-3 sm:grid-cols-2">
		{#if editing}<input type="hidden" name="id" value={editing.id} />{/if}
		<label class="form-control sm:col-span-2"><span class="label-text mb-1">Nama Ujian</span><input class="input input-bordered" name="nama" value={editing?.nama ?? ''} placeholder="Asesmen Sumatif Tengah Semester Genap" required /></label>
		<label class="form-control"><span class="label-text mb-1">Singkatan</span><input class="input input-bordered" name="singkatan" value={editing?.singkatan ?? ''} placeholder="ASTS" /></label>
		<label class="form-control"><span class="label-text mb-1">Status</span><select class="select select-bordered" name="status"><option value="draft" selected={(editing?.status ?? 'draft') === 'draft'}>Draf</option><option value="aktif" selected={editing?.status === 'aktif'}>Aktif</option><option value="selesai" selected={editing?.status === 'selesai'}>Selesai</option></select></label>
		<label class="form-control"><span class="label-text mb-1">Tahun Ajaran</span><select class="select select-bordered" name="tahunAjaranId" bind:value={selectedYearId} required>{#each data.years as year}<option value={year.id}>{year.nama}</option>{/each}</select></label>
		<label class="form-control"><span class="label-text mb-1">Semester</span><select class="select select-bordered" name="semesterId"><option value="">Semua semester</option>{#each selectedYear?.semesters ?? [] as semester}<option value={semester.id} selected={editing?.semesterId === semester.id}>{semester.nama}</option>{/each}</select></label>
		<label class="form-control"><span class="label-text mb-1">Tanggal Ujian</span><input class="input input-bordered" type="date" name="tanggalUjian" value={editing?.tanggalUjian ?? ''} /></label>
		<label class="form-control"><span class="label-text mb-1">Tanggal pada Kartu</span><input class="input input-bordered" type="date" name="tanggalCetak" value={editing?.tanggalCetak ?? ''} /></label>
		<div class="modal-action sm:col-span-2"><button class="btn" type="button" onclick={() => (showSessionForm = false)}>Batal</button><button class="btn btn-primary"><Icon name="save" /> Simpan</button></div>
	</form></div><button class="modal-backdrop" onclick={() => (showSessionForm = false)}>Tutup</button></div>
{/if}
