<script lang="ts">
	import { onMount } from 'svelte';
	import type { PageData } from './$types';
	import type { ContainerSummary } from '$lib/server/docker';

	let { data }: { data: PageData } = $props();
	let containers = $state<ContainerSummary[]>(data.containers);

	const STATE_COLORS: Record<string, { dot: string; label: string }> = {
		running:    { dot: 'bg-primary',         label: 'text-primary' },
		exited:     { dot: 'bg-secondary',       label: 'text-secondary' },
		paused:     { dot: 'bg-on-surface-dim',  label: 'text-on-surface-dim' },
		restarting: { dot: 'bg-primary-dim',     label: 'text-primary-dim' },
	};

	function stateColor(state: string) {
		return STATE_COLORS[state] ?? { dot: 'bg-on-surface-dim', label: 'text-on-surface-dim' };
	}

	onMount(() => {
		const interval = setInterval(async () => {
			const res = await fetch('/api/containers');
			if (res.ok) containers = await res.json();
		}, 5000);
		return () => clearInterval(interval);
	});
</script>

<svelte:head>
	<title>nazuraki.dev</title>
</svelte:head>

<!-- Services -->
<section class="mb-14">
	<h2 class="font-grotesk text-xs font-bold uppercase tracking-[0.1em] text-on-surface-dim mb-5">
		Services
	</h2>
	<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
		{#each data.services as svc (svc.href)}
			<a
				href={svc.href}
				class="block bg-surface-low rounded p-5 hover:bg-surface-container transition-colors group relative overflow-hidden"
			>
				<div class="absolute left-0 top-0 bottom-0 w-1 bg-primary opacity-0 group-hover:opacity-100 transition-opacity rounded-l"></div>
				<div class="font-grotesk font-semibold text-on-surface group-hover:text-primary transition-colors">
					{svc.name}
				</div>
				<div class="font-inter text-sm text-on-surface-variant mt-1">{svc.description}</div>
			</a>
		{/each}
	</div>
</section>

<!-- Docker -->
<section>
	<div class="flex items-baseline gap-4 mb-5">
		<h2 class="font-grotesk text-xs font-bold uppercase tracking-[0.1em] text-on-surface-dim">
			Docker
		</h2>
		<span class="font-grotesk text-xs text-on-surface-dim">{containers.length} containers</span>
	</div>

	{#if containers.length === 0}
		<p class="font-inter text-sm text-on-surface-dim">No containers found or Docker unavailable.</p>
	{:else}
		<div class="grid grid-cols-1 lg:grid-cols-2 gap-3">
			{#each containers as c (c.id)}
				{@const colors = stateColor(c.state)}
				<a
					href="/logs/{c.fullId}"
					class="block bg-surface-low rounded p-5 hover:bg-surface-container transition-colors group relative overflow-hidden"
				>
					<div class="absolute left-0 top-0 bottom-0 w-1 bg-secondary opacity-0 group-hover:opacity-100 transition-opacity rounded-l"></div>

					<div class="flex items-start justify-between gap-3">
						<div class="min-w-0">
							<div class="font-grotesk font-semibold text-on-surface truncate group-hover:text-primary transition-colors">
								{c.name}
							</div>
							<div class="font-inter text-xs text-on-surface-variant truncate mt-0.5">{c.image}</div>
						</div>
						<div class="shrink-0 flex items-center gap-1.5">
							<span class="w-1.5 h-1.5 rounded-full {colors.dot}"></span>
							<span class="font-grotesk text-xs font-medium uppercase tracking-[0.08em] {colors.label}">
								{c.state}
							</span>
						</div>
					</div>

					<div class="font-inter text-xs text-on-surface-dim mt-2">{c.status}</div>

					{#if c.ports.length > 0}
						<div class="mt-3 flex flex-wrap gap-1.5">
							{#each c.ports as port (port)}
								<span class="font-grotesk text-xs bg-surface-high text-on-surface-variant px-2 py-0.5 rounded">
									{port}
								</span>
							{/each}
						</div>
					{/if}
				</a>
			{/each}
		</div>
	{/if}
</section>
