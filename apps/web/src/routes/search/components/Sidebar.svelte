<script lang="ts">
	import { page } from '$app/state';
	import { searchCache } from '$lib/search/stores';

	const navItems = [
		{ label: 'Recent', href: '/search' },
		{ label: 'Tag Atlas', href: '/search/tags' }
	];

	function isActive(href: string) {
		if (href === '/search') return page.url.pathname === '/search';
		return page.url.pathname.startsWith(href);
	}

	let cache = $derived($searchCache);
	let entryId = $derived(page.params.id ?? '');
</script>

<aside class="w-52 flex-shrink-0 flex flex-col bg-surface h-screen sticky top-0 overflow-hidden">
	<div class="px-5 pt-6 pb-4">
		<div class="label-sm text-primary mb-1">Second Brain</div>
		<div class="label-sm text-on-surface-dim">LOCAL/FIRST · VECTOR 08</div>
	</div>

	{#if cache && entryId}
		<div class="px-2 pb-2 flex items-center justify-between">
			<span class="label-sm text-on-surface-faint px-1">RESULTS</span>
			<a
				href="/search/results?q={encodeURIComponent(cache.query)}&page={cache.page}"
				class="label-sm text-primary hover:text-primary/70 transition-colors px-1"
			>← BACK</a>
		</div>
		<div class="flex-1 overflow-y-auto">
			{#each cache.results.entries as r (r.id)}
				<a
					href="/search/entry/{r.id}"
					class="flex flex-col px-4 py-3 border-b border-outline/30 transition-colors {r.id === entryId ? 'bg-surface-low' : 'hover:bg-surface-low'}"
				>
					<span class="label-sm mb-0.5 {r.id === entryId ? 'text-primary' : 'text-on-surface-faint'}">{r.type}</span>
					<span class="text-xs leading-snug line-clamp-2 {r.id === entryId ? 'text-on-surface' : 'text-on-surface-dim'}">{r.title}</span>
				</a>
			{/each}
		</div>
	{:else}
		<nav class="flex-1 px-2">
			{#each navItems as item (item.href)}
				<a
					href={item.href}
					class="relative flex items-center gap-3 px-3 py-2.5 mb-1 rounded-[4px] transition-colors label-sm
						{isActive(item.href)
							? 'text-primary bg-surface-low editorial-strip-left'
							: 'text-on-surface-dim hover:text-on-surface hover:bg-surface-low'}"
				>
					{item.label}
				</a>
			{/each}
		</nav>
	{/if}

	<div class="px-4 py-3 bg-surface-low">
		<div class="label-sm text-on-surface-faint">
			SYSTEM STATUS: NOMINAL // LATENCY: —
		</div>
	</div>
</aside>
