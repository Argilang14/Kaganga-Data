<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';

	$effect(() => {
		void goto(resolve('/data-mata-pelajaran'), { replaceState: true });
	});
</script>

<div class="p-6">Mengalihkan ke Data Mata Pelajaran...</div>
