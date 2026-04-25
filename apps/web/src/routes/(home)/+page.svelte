<script lang="ts">
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
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

