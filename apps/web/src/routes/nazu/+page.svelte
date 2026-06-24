<script lang="ts">
	import { dueIn } from '$lib/time';
	import ResultCard from '../search/components/ResultCard.svelte';
	import Chat from './components/Chat.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head><title>nazu — second brain</title></svelte:head>

<main class="px-4 md:px-8 py-6 md:py-10 max-w-5xl">
	<section class="mb-14">
		<Chat />
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
