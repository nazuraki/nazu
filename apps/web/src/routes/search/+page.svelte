<script lang="ts">
	import { goto } from '$app/navigation';
	import { api } from '$lib/search/api';
	import TagBadge from './components/TagBadge.svelte';
	import ResultCard from './components/ResultCard.svelte';

	let query = $state('');

	function handleSearch(e: Event) {
		e.preventDefault();
		const q = query.trim();
		if (q) goto(`/search/results?q=${encodeURIComponent(q)}`);
	}

	const recent = api.getRecent(6);
	const tags = api.getTags();
</script>

<svelte:head><title>Search — Second Brain</title></svelte:head>

<header class="flex items-center justify-between px-8 py-4 bg-surface border-b border-outline">
	<span class="label-md text-primary">ARCHIVE_V01</span>
	<span class="label-sm text-on-surface-faint">⚙</span>
</header>

<main class="px-4 md:px-8 py-6 md:py-10 max-w-5xl">
	<div class="mb-16">
		<div class="label-sm text-on-surface-faint mb-4">INITIAL_QUERY</div>
		<form onsubmit={handleSearch}>
			<div class="relative">
				<input
					bind:value={query}
					type="text"
					placeholder="Initiate Search Sequence..."
					class="display-lg w-full bg-transparent text-on-surface outline-none border-none caret-primary"
					style="font-size: clamp(1.5rem, 4vw, 3.5rem);"
				/>
				<button type="submit" class="absolute right-0 top-1/2 -translate-y-1/2 text-on-surface-faint hover:text-primary transition-colors p-2">
					⌕
				</button>
			</div>
			<div class="h-px bg-surface-high mt-4 relative">
				<div class="absolute inset-0 bg-gradient-to-r from-primary/40 to-transparent {query ? 'opacity-100' : 'opacity-0'} transition-opacity"></div>
			</div>
		</form>
	</div>

	<div class="grid grid-cols-1 md:grid-cols-[1fr_1.5fr] gap-8 md:gap-12">
		<div>
			<div class="flex items-center justify-between mb-4">
				<span class="label-md text-on-surface">Tag Atlas</span>
				{#await tags}
					<span class="label-sm text-on-surface-faint animate-pulse">—</span>
				{:then t}
					<span class="label-sm text-on-surface-faint">{t.length} ACTIVE</span>
				{/await}
			</div>
			{#await tags}
				<div class="label-sm text-on-surface-faint animate-pulse">LOADING...</div>
			{:then tagList}
				<div class="flex flex-wrap gap-2">
					{#each tagList.slice(0, 16) as tag (tag.name)}
						<a href="/search/results?q={encodeURIComponent(tag.name)}">
							<TagBadge label={tag.name} />
						</a>
					{/each}
				</div>
			{:catch}
				<div class="label-sm text-on-surface-faint">UNAVAILABLE</div>
			{/await}
		</div>

		<div>
			<div class="label-md text-on-surface mb-4">Recent Entries</div>
			{#await recent}
				<div class="flex flex-col gap-3">
					{#each Array(4) as _, i (i)}
						<div class="bg-surface-low rounded-[4px] h-20 animate-pulse"></div>
					{/each}
				</div>
			{:then entries}
				<div class="flex flex-col gap-3">
					{#each entries as entry (entry.id)}
						<ResultCard {entry} />
					{/each}
				</div>
			{:catch}
				<div class="label-sm text-on-surface-faint">UNAVAILABLE</div>
			{/await}
		</div>
	</div>
</main>
