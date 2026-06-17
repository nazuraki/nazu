<script lang="ts">
	import { api } from '$lib/search/api';
	import type { Entry } from '$lib/search/types';
	import { dueIn } from '$lib/time';
	import ResultCard from '../search/components/ResultCard.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let query = $state('');
	let results = $state<Entry[] | null>(null);
	let searching = $state(false);
	let searchError = $state(false);
	let lastQuery = $state('');

	async function recall(e: Event) {
		e.preventDefault();
		const q = query.trim();
		if (!q) {
			results = null;
			searchError = false;
			return;
		}
		searching = true;
		searchError = false;
		lastQuery = q;
		try {
			const res = await api.search(q);
			results = res.entries;
		} catch {
			searchError = true;
			results = null;
		} finally {
			searching = false;
		}
	}
</script>

<svelte:head><title>nazu — second brain</title></svelte:head>

<main class="px-4 md:px-8 py-6 md:py-10 max-w-5xl">
	<section class="mb-14">
		<div class="label-sm text-on-surface-faint mb-4">Recall</div>
		<form onsubmit={recall}>
			<div class="relative">
				<input
					bind:value={query}
					type="text"
					placeholder="Ask your second brain…"
					class="display-lg w-full bg-transparent text-on-surface outline-none border-none caret-primary"
					style="font-size: clamp(1.5rem, 4vw, 3rem);"
				/>
				<button
					type="submit"
					class="absolute right-0 top-1/2 -translate-y-1/2 text-on-surface-faint hover:text-primary transition-colors p-2"
					aria-label="Recall"
				>
					⌕
				</button>
			</div>
			<div class="h-px bg-surface-high mt-4 relative">
				<div
					class="absolute inset-0 bg-gradient-to-r from-primary/40 to-transparent transition-opacity {query
						? 'opacity-100'
						: 'opacity-0'}"
				></div>
			</div>
		</form>

		{#if searching}
			<div class="label-sm text-on-surface-faint mt-6 animate-pulse">Searching…</div>
		{:else if searchError}
			<div class="label-sm text-on-surface-faint mt-6">Recall failed — try again.</div>
		{:else if results}
			<div class="flex items-center justify-between mt-6 mb-3">
				<span class="label-md text-on-surface">Results</span>
				<span class="label-sm text-on-surface-faint">{results.length} for “{lastQuery}”</span>
			</div>
			{#if results.length > 0}
				<div class="flex flex-col gap-3">
					{#each results as entry (entry.id)}
						<ResultCard {entry} query={lastQuery} />
					{/each}
				</div>
			{:else}
				<div class="label-sm text-on-surface-faint">No matches.</div>
			{/if}
		{/if}
	</section>

	<div class="grid grid-cols-1 md:grid-cols-[1.5fr_1fr] gap-8 md:gap-12">
		<section>
			<div class="label-md text-on-surface mb-4">Recent Knowledge</div>
			{#if data.recent.length > 0}
				<div class="flex flex-col gap-3">
					{#each data.recent as entry (entry.id)}
						<ResultCard {entry} />
					{/each}
				</div>
			{:else}
				<div class="label-sm text-on-surface-faint">
					Nothing yet — ingest something to fill your second brain.
				</div>
			{/if}
		</section>

		<section>
			<div class="flex items-center justify-between mb-4">
				<span class="label-md text-on-surface">Open Tasks</span>
				<span class="label-sm text-on-surface-faint">{data.tasks.length}</span>
			</div>
			{#if data.tasks.length > 0}
				<div class="flex flex-col gap-2">
					{#each data.tasks as task (task.id)}
						<div class="flex items-start gap-3 bg-surface-low rounded-[4px] p-3">
							<span
								class="mt-1.5 w-2 h-2 rounded-full shrink-0"
								class:bg-secondary={task.priority === 'high'}
								class:bg-primary={task.priority === 'medium'}
								class:bg-outline={!task.priority}
							></span>
							<div class="min-w-0 flex-1">
								<div class="text-sm text-on-surface leading-snug">{task.title}</div>
								{#if task.due_date}
									<div class="label-sm text-on-surface-faint mt-1">{dueIn(task.due_date)}</div>
								{/if}
							</div>
						</div>
					{/each}
				</div>
			{:else}
				<div class="label-sm text-on-surface-faint">No open tasks.</div>
			{/if}
		</section>
	</div>
</main>
