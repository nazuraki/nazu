<script lang="ts">
	import Sidebar from './components/Sidebar.svelte';

	let { children } = $props();
</script>

<div class="flex h-screen bg-surface-lowest overflow-hidden font-inter">
	<Sidebar />
	<div class="flex-1 overflow-y-auto">
		{@render children()}
	</div>
</div>
