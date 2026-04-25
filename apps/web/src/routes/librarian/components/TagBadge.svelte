<script lang="ts">
	const typeColors: Record<string, string> = {
		PROTOCOL: 'bg-primary/20 text-primary',
		LOG_IMPORT: 'bg-secondary/20 text-secondary',
		RAW_DATA: 'bg-surface-high text-on-surface-dim'
	};

	let { label, variant = 'tag' }: { label: string; variant?: 'tag' | 'type' } = $props();

	const colorClass = $derived(typeColors[label] ?? 'bg-surface-high text-on-surface-dim');
</script>

{#if variant === 'type'}
	<span class="label-sm px-2 py-1 rounded-[4px] {colorClass}">{label}</span>
{:else}
	<span class="label-sm px-2 py-1 rounded-[4px] bg-surface-high text-on-surface-dim hover:text-primary transition-colors cursor-default">
		{label}
	</span>
{/if}
