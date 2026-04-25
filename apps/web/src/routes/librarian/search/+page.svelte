<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { get } from 'svelte/store';
	import { api } from '$lib/librarian/api';
	import { searchCache } from '$lib/librarian/stores';
	import ResultCard from '../components/ResultCard.svelte';
	import type { SearchResponse } from '$lib/librarian/types';

	let query = $derived(page.url.searchParams.get('q') ?? '');
	let currentPage = $derived(Number(page.url.searchParams.get('page') ?? '1'));

	let results = $state<SearchResponse | null>(null);
	let error = $state(false);
	let inputQuery = $state('');

	$effect(() => {
		if (!query) return;
		inputQuery = query;
		error = false;
		const cached = get(searchCache);
		if (cached && cached.query === query && cached.page === currentPage) {
			results = cached.results;
			return;
		}
		results = null;
		api
			.search(query, currentPage)
			.then((r) => {
				results = r;
				searchCache.set({ query, page: currentPage, results: r });
			})
			.catch(() => (error = true));
	});

	function handleSearch(e: Event) {
		e.preventDefault();
		const q = inputQuery.trim();
		if (q) goto(`/librarian/search?q=${encodeURIComponent(q)}`);
	}

	function goPage(p: number) {
		goto(`/librarian/search?q=${encodeURIComponent(query)}&page=${p}`);
	}
</script>

<svelte:head><title>"{query}" — Librarian</title></svelte:head>

<header class="flex items-center gap-6 px-8 py-4 bg-surface border-b border-outline">
	<span class="label-md text-primary">ARCHIVE_V01</span>
	<form onsubmit={handleSearch} class="flex-1 max-w-xl">
		<div class="relative bg-surface-low rounded-[4px] editorial-strip-left">
			<input
				bind:value={inputQuery}
				type="text"
				class="w-full bg-transparent px-4 py-2 pl-5 text-sm text-on-surface outline-none"
				placeholder="Search..."
			/>
		</div>
	</form>
	<span class="label-sm text-on-surface-faint">⚙</span>
</header>

<main class="px-8 py-8 max-w-3xl">
	<div class="mb-6">
		<h1 class="display-md text-on-surface mb-1">
			<span class="text-on-surface-dim">"</span>{query}<span class="text-on-surface-dim">"</span>
			{#if results}
				<span class="text-base font-inter font-normal text-on-surface-dim ml-3">{results.total} ENTRIES FOUND</span>
			{/if}
		</h1>
		{#if results}
			<p class="label-sm text-on-surface-faint">
				Query completed in {results.duration} across local vector clusters.
			</p>
		{/if}
	</div>

	{#if !results && !error}
		<div class="flex flex-col gap-3">
			{#each Array(4) as _}
				<div class="bg-surface-low rounded-[4px] h-28 animate-pulse"></div>
			{/each}
		</div>
	{:else if error}
		<div class="label-sm text-secondary">QUERY FAILED — check server connection</div>
	{:else if results && results.entries.length === 0}
		<div class="label-sm text-on-surface-faint">NO ENTRIES FOUND</div>
	{:else if results}
		<div class="flex flex-col gap-3">
			{#each results.entries as entry}
				<ResultCard {entry} query={query} />
			{/each}
		</div>

		{#if results.total > results.page_size}
			<div class="flex items-center gap-4 mt-8">
				{#if currentPage > 1}
					<button onclick={() => goPage(currentPage - 1)} class="label-sm text-primary hover:text-primary/70 transition-colors">← PREV</button>
				{/if}
				<span class="label-sm text-on-surface-faint">PAGE {currentPage}</span>
				{#if currentPage * results.page_size < results.total}
					<button onclick={() => goPage(currentPage + 1)} class="label-sm text-primary hover:text-primary/70 transition-colors">NEXT →</button>
				{/if}
			</div>
		{/if}
	{/if}
</main>

<footer class="fixed bottom-0 right-0 px-6 py-2 bg-surface-low border-t border-outline">
	<span class="label-sm text-on-surface-faint">
		{#if results}
			SYSTEM STATUS: NOMINAL // ENTRIES: {results.total} // VECTOR SEARCH ACTIVE
		{:else}
			SYSTEM STATUS: QUERYING...
		{/if}
	</span>
</footer>
