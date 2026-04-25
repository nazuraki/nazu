<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';

	const id = $derived(page.params.id!);
	let lines = $state<string[]>([]);
	let logEl = $state<HTMLElement | null>(null);
	let atBottom = $state(true);

	function scrollToBottom() {
		if (logEl) logEl.scrollTop = logEl.scrollHeight;
	}

	function onScroll() {
		if (!logEl) return;
		atBottom = logEl.scrollTop + logEl.clientHeight >= logEl.scrollHeight - 20;
	}

	onMount(() => {
		const source = new EventSource(`/api/containers/${id}/logs`);

		source.onmessage = (e) => {
			lines.push(JSON.parse(e.data));
			if (lines.length > 2000) lines = lines.slice(-2000);
			if (atBottom) setTimeout(scrollToBottom, 0);
		};

		source.onerror = () => source.close();
		return () => source.close();
	});
</script>

<svelte:head>
	<title>logs — {id.slice(0, 12)}</title>
</svelte:head>

<div class="flex items-center gap-5 mb-8">
	<a href="/" class="font-grotesk text-xs text-secondary hover:text-on-surface-variant transition-colors uppercase tracking-[0.08em]">
		← back
	</a>
	<span class="w-px h-4 bg-outline opacity-30"></span>
	<h1 class="font-grotesk text-sm font-semibold text-on-surface-variant truncate">
		{id.slice(0, 12)}
	</h1>
</div>

<div
	bind:this={logEl}
	onscroll={onScroll}
	class="bg-surface rounded p-5 h-[calc(100vh-13rem)] overflow-y-auto"
>
	{#if lines.length === 0}
		<div class="font-inter text-sm text-on-surface-dim">Waiting for logs…</div>
	{:else}
		{#each lines as line, i (i)}
			<div class="font-inter text-xs text-on-surface-variant leading-relaxed whitespace-pre-wrap break-all">{line}</div>
		{/each}
	{/if}
</div>

{#if !atBottom}
	<button
		onclick={scrollToBottom}
		class="fixed bottom-6 right-6 bg-surface-high text-secondary font-grotesk text-xs uppercase tracking-[0.08em] px-4 py-2 rounded hover:bg-surface-container transition-colors"
	>
		↓ bottom
	</button>
{/if}
