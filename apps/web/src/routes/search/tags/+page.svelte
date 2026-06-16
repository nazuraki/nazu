<script lang="ts">
	import { api } from '$lib/search/api';

	const tags = api.getTags();
</script>

<svelte:head><title>Tag Atlas — Second Brain</title></svelte:head>

<header class="flex items-center justify-between px-8 py-4 bg-surface border-b border-outline">
	<span class="label-md text-primary">ARCHIVE_V01</span>
	<span class="label-sm text-on-surface-faint">⚙</span>
</header>

<main class="px-4 md:px-8 py-6 md:py-10 max-w-5xl">
	<div class="flex items-end justify-between mb-8">
		<h1 class="display-md text-on-surface">Tag Atlas</h1>
		{#await tags then t}
			<span class="label-sm text-on-surface-faint">{t.length} TAGS</span>
		{/await}
	</div>

	{#await tags}
		<div class="label-sm text-on-surface-faint animate-pulse">LOADING...</div>
	{:then tagList}
		{#if tagList.length === 0}
			<div class="label-sm text-on-surface-faint">NO TAGS YET</div>
		{:else}
			<div class="flex flex-wrap gap-2">
				{#each tagList as tag (tag.name)}
					<a
						href="/search/results?q={encodeURIComponent(tag.name)}"
						class="group flex items-center gap-2 px-3 py-1.5 rounded-[4px] bg-surface-high text-on-surface-dim hover:text-primary transition-colors"
					>
						<span class="label-sm">{tag.name}</span>
						<span class="label-sm text-on-surface-faint group-hover:text-primary/70">{tag.count}</span>
					</a>
				{/each}
			</div>
		{/if}
	{:catch}
		<div class="label-sm text-on-surface-faint">UNAVAILABLE</div>
	{/await}
</main>
