<script lang="ts">
	let { username, roleType } = $props<{ username: string; roleType: string }>();
</script>

<p class="text-base-content/70">
	Izin <strong>{username}</strong> akan dikembalikan ke standar role
	<strong>{roleType}</strong>. Penyesuaian izin manual akan diganti, tetapi akun dan data terkait tetap aman.
</p>
