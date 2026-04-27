<script lang="ts">
	import type { Entry } from '$lib/search/types';
	import TagBadge from './TagBadge.svelte';

	let { entry, query = '' }: { entry: Entry; query?: string } = $props();

	function highlight(text: string, q: string): string {
		if (!q) return text;
		const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
		return text.replace(new RegExp(`(${escaped})`, 'gi'), '<strong>$1</strong>');
	}
</script>

<a
	href="/search/entry/{entry.id}"
	class="group flex gap-5 bg-surface-low hover:bg-surface-container transition-colors rounded-[4px] p-5"
>
	<div class="flex-1 min-w-0">
		<div class="flex items-center gap-2 mb-3">
			<TagBadge label={entry.type} variant="type" />
			{#if entry.updated_at}
				<span class="label-sm text-on-surface-faint">{entry.updated_at}</span>
			{/if}
		</div>

		<h2 class="font-grotesk text-lg font-semibold text-on-surface mb-2 leading-snug group-hover:text-primary transition-colors">
			<!-- eslint-disable-next-line svelte/no-at-html-tags -->
			{@html highlight(entry.title, query)}
		</h2>

		{#if entry.excerpt}
			<p class="text-sm text-on-surface-dim leading-relaxed line-clamp-2">
				<!-- eslint-disable-next-line svelte/no-at-html-tags -->
				{@html highlight(entry.excerpt, query)}
			</p>
		{/if}

		<div class="flex items-center gap-4 mt-3">
			{#if entry.author}
				<span class="label-sm text-on-surface-faint">{entry.author}</span>
			{/if}
			{#if entry.ref_count > 0}
				<span class="label-sm text-on-surface-faint">{entry.ref_count} REF</span>
			{/if}
			{#if entry.vector_score}
				<span class="label-sm text-primary">{entry.vector_score.toFixed(4)}</span>
			{/if}
		</div>
	</div>
</a>
