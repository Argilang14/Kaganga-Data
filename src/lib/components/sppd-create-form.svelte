<script lang="ts">
	import { hideModal, updateModal } from '$lib/components/global-modal.svelte';
	import SppdFormFields from '$lib/components/sppd-form-fields.svelte';
	import { onMount } from 'svelte';

	type Employee = { id: number; nama: string; nip: string; jenis: string };

	let { employees }: { employees: Employee[] } = $props();
	let formElement: HTMLFormElement;

	onMount(() => {
		updateModal({
			onPositive: {
				label: 'Simpan Draft',
				icon: 'save',
				class: 'btn-primary',
				action: () => formElement.requestSubmit()
			},
			onNeutral: { label: 'Batal', action: hideModal },
			onNegative: undefined
		});
	});
</script>

<form
	bind:this={formElement}
	method="POST"
	action="?/create"
	class="grid w-full items-start gap-5 md:grid-cols-2"
>
	<SppdFormFields {employees} />
</form>
