<script lang="ts">
	import { extractCitedIndices } from '$lib/nazu/chat-client';
	import type { ChatSource } from '$lib/nazu/types';

	let {
		role,
		content,
		sources = [],
		streaming = false
	}: {
		role: 'user' | 'assistant';
		content: string;
		sources?: ChatSource[];
		streaming?: boolean;
	} = $props();

	// Only surface the sources the answer actually cites (by [n] marker).
	let cited = $derived.by(() => {
		const idx = new Set(extractCitedIndices(content, sources.length));
		return sources.filter((s) => idx.has(s.n));
	});
</script>

{#if role === 'user'}
	<div class="flex justify-end">
		<div
			class="max-w-[85%] bg-surface-low rounded-[4px] px-4 py-2.5 text-on-surface whitespace-pre-wrap"
		>
			{content}
		</div>
	</div>
{:else}
	<div class="flex flex-col gap-3">
		<div class="label-sm text-on-surface-faint">nazu</div>
		{#if content}
			<div class="text-on-surface leading-relaxed whitespace-pre-wrap">{content}</div>
		{:else if streaming}
			<div class="label-sm text-on-surface-faint animate-pulse">Thinking…</div>
		{/if}
		{#if cited.length > 0}
			<div class="flex flex-col gap-1.5 mt-1">
				<div class="label-sm text-on-surface-faint">Sources</div>
				{#each cited as s (s.id)}
					<a
						href="/search/entry/{s.id}"
						class="flex items-baseline gap-2 text-sm text-on-surface-faint hover:text-primary transition-colors"
					>
						<span class="text-primary tabular-nums">[{s.n}]</span>
						<span class="truncate">{s.title}</span>
					</a>
				{/each}
			</div>
		{/if}
	</div>
{/if}
