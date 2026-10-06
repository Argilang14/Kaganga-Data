<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import CheatModal from '$lib/components/asesmen-sumatif/cheat-modal.svelte';
	import Icon from '$lib/components/icon.svelte';
	import { showModal, updateModal } from '$lib/components/global-modal.svelte';
	import { generateCheatResult } from '$lib/components/asesmen-sumatif/cheat-generator';
	import type { EntryDraft } from '$lib/components/asesmen-sumatif/types';
	import { normalizeScoreText, toInputText } from '$lib/components/asesmen-sumatif/utils';

	type CheatControlsProps = {
		entries: EntryDraft[];
		hasTujuan: boolean;
		initialNilaiAkhir: number | null;
		nilaiAkhir: number | null;
		disabled: boolean;
	};

	type CheatApplyDetail = {
		entries: EntryDraft[];
		sasTesText: string;
		sasNonTesText: string;
		stsTesText: string;
		stsNonTesText: string;
	};

	let {
		entries,
		hasTujuan,
		initialNilaiAkhir,
		nilaiAkhir,
		disabled: isDisabled
	}: CheatControlsProps = $props();
	const dispatch = createEventDispatcher<{
		apply: CheatApplyDetail;
	}>();

	let cheatNilaiAkhirText = $state('');
	let cheatModalError = $state<string | null>(null);

	function syncCheatModalBody(): void {
		updateModal({
			bodyProps: {
				nilaiAkhirText: cheatNilaiAkhirText,
				errorMessage: cheatModalError,
				onInput: handleCheatInput
			}
		});
	}

	function handleCheatInput(value: string): void {
		cheatNilaiAkhirText = value;
		cheatModalError = null;
		syncCheatModalBody();
	}

	function handleCheatConfirm(close: () => void): void {
		const normalized = normalizeScoreText(cheatNilaiAkhirText);
		if (normalized == null) {
			cheatModalError = 'Masukkan angka antara 0 sampai 100 dengan maksimal dua angka desimal.';
			syncCheatModalBody();
			return;
		}
		if (!entries.length) {
			cheatModalError = 'Tidak ada tujuan pembelajaran yang dapat diisi otomatis.';
			syncCheatModalBody();
			return;
		}
		const result = generateCheatResult(entries, normalized);
		if (!result) {
			cheatModalError = 'Gagal menghasilkan nilai acak yang valid. Coba lagi.';
			syncCheatModalBody();
			return;
		}
		dispatch('apply', {
			entries: result.drafts,
			sasTesText: toInputText(result.sasTes),
			sasNonTesText: toInputText(result.sasNonTes),
			stsTesText: toInputText(result.sasTes),
			stsNonTesText: toInputText(result.sasNonTes)
		});
		cheatModalError = null;
		close();
	}

	function openCheatModal(): void {
		if (!hasTujuan) return;
		cheatNilaiAkhirText = toInputText(initialNilaiAkhir ?? nilaiAkhir ?? null);
		cheatModalError = null;
		showModal({
			title: 'Isi Nilai Sumatif Sekaligus',
			body: CheatModal,
			bodyProps: {
				nilaiAkhirText: cheatNilaiAkhirText,
				errorMessage: cheatModalError,
				onInput: handleCheatInput
			},
			dismissible: true,
			onNegative: {
				label: 'Batal',
				icon: 'close',
				action: ({ close }) => close()
			},
			onPositive: {
				label: 'Terapkan',
				icon: 'check',
				action: ({ close }) => handleCheatConfirm(close)
			}
		});
	}
</script>

<button
	type="button"
	class="btn btn-soft shadow-none"
	onclick={openCheatModal}
	disabled={!hasTujuan || isDisabled}
>
	<Icon name="copy" />
	Isi Sekaligus
</button>
