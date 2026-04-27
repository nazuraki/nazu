<script lang="ts">
	import Sidebar from './components/Sidebar.svelte';

	let { children } = $props();
</script>

<div class="flex md:h-screen bg-surface-lowest md:overflow-hidden font-inter min-h-screen">
	<div class="hidden md:block">
		<Sidebar />
	</div>
	<div class="flex-1 md:overflow-y-auto">
		{@render children()}
	</div>
</div>
