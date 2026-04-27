<script lang="ts">
	import { page } from '$app/state';
	import { get } from 'svelte/store';
	import { api } from '$lib/search/api';
	import { entryCache } from '$lib/search/stores';
	import TagBadge from '../../components/TagBadge.svelte';
	import type { EntryDetail } from '$lib/search/types';

	let id = $derived(page.params.id ?? '');
	let entry = $state<EntryDetail | null>(null);
	let error = $state(false);

	$effect(() => {
		const cached = get(entryCache).get(id);
		if (cached) {
			entry = cached;
			error = false;
			return;
		}
		entry = null;
		error = false;
		api
			.getEntry(id)
			.then((e) => {
				entry = e;
				entryCache.update((m) => {
					m.set(id, e);
					return m;
				});
			})
			.catch(() => (error = true));
	});
</script>

<svelte:head>
	<title>{entry?.title ?? 'Entry'} — Search</title>
</svelte:head>

<header class="flex items-center gap-4 px-4 md:px-8 py-3 bg-surface border-b border-outline">
	<a href="/search" class="label-sm text-primary md:hidden" aria-label="Back to search">←</a>
	<a href="/search" class="label-sm text-primary hidden md:inline">ARCHIVE_V01</a>
	<span class="label-sm text-on-surface-faint hidden md:inline">/</span>
	{#if entry}
		<span class="label-sm text-on-surface-faint hidden md:inline">FILE REFERENCE: {entry.id}</span>
		<span class="label-sm text-on-surface-faint ml-auto truncate">LAST MODIFIED: {entry.updated_at}</span>
	{/if}
</header>

{#if error}
	<div class="px-8 py-10 label-sm text-secondary">ENTRY NOT FOUND</div>
{:else if !entry}
	<div class="flex flex-col md:flex-row gap-0">
		<div class="flex-1 px-4 md:px-8 py-6 md:py-10">
			<div class="h-16 w-2/3 bg-surface-low rounded-[4px] animate-pulse mb-6"></div>
			<div class="space-y-3">
				{#each Array(8) as _, i (i)}
					<div class="h-4 bg-surface-low rounded-[4px] animate-pulse"></div>
				{/each}
			</div>
		</div>
		<div class="hidden md:block w-72 bg-surface h-screen border-l border-outline"></div>
	</div>
{:else}
	<div class="flex flex-col md:flex-row md:min-h-screen">
		<article class="flex-1 px-4 md:px-8 py-6 md:py-10 max-w-2xl">
			<div class="flex gap-2 mb-6">
				<TagBadge label={entry.type} variant="type" />
				{#each entry.tags as tag (tag)}
					<TagBadge label={tag} />
				{/each}
			</div>

			<h1 class="display-lg text-on-surface mb-8 leading-tight">{entry.title}</h1>

			<div class="prose prose-invert prose-sm max-w-none text-on-surface-dim leading-relaxed space-y-4">
				{#each (entry.content ?? '').split('\n') as paragraph, i (i)}
					{#if paragraph.trim()}
						<p>{paragraph}</p>
					{/if}
				{/each}
			</div>

			{#if entry.image_url}
				<figure class="my-8">
					<img src={entry.image_url} alt={entry.title} class="w-full rounded-[4px] opacity-80" />
					<figcaption class="label-sm text-on-surface-faint mt-3 text-center">
						FIG. VISUALIZATION OF {entry.type}
					</figcaption>
				</figure>
			{/if}
		</article>

		<aside class="w-full md:w-72 flex-shrink-0 px-4 md:px-6 py-8 md:py-10 border-t md:border-t-0 md:border-l border-outline bg-surface md:h-screen md:sticky md:top-0 md:overflow-y-auto">
			<div class="label-md text-on-surface mb-6">ARCHIVIST METADATA</div>

			<div class="grid grid-cols-2 gap-4 mb-8">
				<div>
					<div class="label-sm text-on-surface-faint mb-1">WORDS</div>
					<div class="font-grotesk text-xl font-semibold text-on-surface">{entry.word_count.toLocaleString()}</div>
				</div>
				<div>
					<div class="label-sm text-on-surface-faint mb-1">READ TIME</div>
					<div class="font-grotesk text-xl font-semibold text-on-surface">{entry.read_time || Math.ceil(entry.word_count / 200)}:00</div>
				</div>
			</div>

			{#if entry.related?.length > 0}
				<div>
					<div class="label-md text-on-surface mb-4">SEARCH CONTEXT</div>
					<div class="flex flex-col gap-3">
						{#each entry.related as rel (rel.id)}
							<a
								href="/search/entry/{rel.id}"
								class="group flex gap-3 p-3 bg-surface-low hover:bg-surface-container rounded-[4px] transition-colors"
							>
								<div class="w-8 h-8 flex-shrink-0 rounded-[4px] bg-surface-high"></div>
								<div class="flex-1 min-w-0">
									<div class="label-sm text-on-surface-faint mb-1">{rel.type}</div>
									<div class="text-xs text-on-surface group-hover:text-primary transition-colors leading-snug line-clamp-2">
										{rel.title}
									</div>
								</div>
							</a>
						{/each}
					</div>
				</div>
			{/if}
		</aside>
	</div>
{/if}

<footer class="fixed bottom-0 right-0 px-6 py-2 bg-surface-low border-t border-outline">
	<span class="label-sm text-on-surface-faint">
		{#if entry}
			LOCAL / FIRST · VECTOR 08 · REFS: {entry.ref_count}
		{:else}
			LOADING...
		{/if}
	</span>
</footer>
