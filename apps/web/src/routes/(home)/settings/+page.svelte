<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let busy = $state<string | null>(null);
	let errorMsg = $state<string | null>(null);

	async function toggle(profile: string, enabled: boolean) {
		busy = profile;
		errorMsg = null;
		try {
			const res = await fetch('/api/services', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ profile, enabled }),
			});
			if (!res.ok) {
				const body = await res.json().catch(() => null);
				throw new Error(body?.message ?? `request failed (${res.status})`);
			}
			await invalidateAll();
		} catch (e) {
			errorMsg = e instanceof Error ? e.message : 'failed to update service';
		} finally {
			busy = null;
		}
	}
</script>

<svelte:head>
	<title>settings — nazuraki.dev</title>
</svelte:head>

<div class="flex items-center gap-5 mb-8">
	<a href="/" class="font-grotesk text-xs text-secondary hover:text-on-surface-variant transition-colors uppercase tracking-[0.08em]">
		← back
	</a>
	<span class="w-px h-4 bg-outline opacity-30"></span>
	<h1 class="font-grotesk text-sm font-semibold text-on-surface-variant">Settings</h1>
</div>

<section class="mb-14">
	<h2 class="font-grotesk text-xs font-bold uppercase tracking-[0.1em] text-on-surface-dim mb-5">
		Optional services
	</h2>

	{#if errorMsg}
		<div class="bg-surface-low border-l-2 border-error rounded p-4 mb-4 font-inter text-sm text-error">
			{errorMsg}
		</div>
	{/if}

	<div class="grid grid-cols-1 gap-3">
		{#each data.services as svc (svc.profile)}
			{@const blocked = svc.missingEnv.length > 0}
			<div class="bg-surface-low rounded p-5 flex items-center justify-between gap-4">
				<div class="min-w-0">
					<div class="font-grotesk font-semibold text-on-surface">{svc.label}</div>
					<div class="font-inter text-sm text-on-surface-variant mt-1">
						{#if blocked}
							Missing config: {svc.missingEnv.join(', ')}
						{:else if svc.running}
							Running
						{:else}
							Stopped
						{/if}
					</div>
				</div>
				<button
					onclick={() => toggle(svc.profile, !svc.enabled)}
					disabled={busy !== null || (blocked && !svc.enabled)}
					class="font-grotesk text-xs uppercase tracking-[0.08em] px-4 py-2 rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed
						{svc.enabled
							? 'bg-surface-container text-on-surface-variant hover:bg-surface'
							: 'bg-primary text-on-primary hover:opacity-90'}"
				>
					{#if busy === svc.profile}
						…
					{:else if svc.enabled}
						Disable
					{:else}
						Enable
					{/if}
				</button>
			</div>
		{/each}
	</div>
</section>
