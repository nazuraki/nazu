<script lang="ts">
	import '../app.css';
	import { page } from '$app/state';

	const { children } = $props();

	const pageName = $derived.by(() => {
		const seg = page.url.pathname.split('/').filter(Boolean)[0];
		return seg ?? 'home';
	});
</script>

<div class="min-h-screen bg-surface-lowest text-on-surface font-inter">
	<header class="bg-surface px-8 h-12 flex items-center justify-between">
		<div class="flex items-baseline gap-3">
			<a href="/" class="font-grotesk font-bold text-primary tracking-tight hover:text-primary-dim transition-colors">
				nazu
			</a>
			<span class="w-px h-3 bg-outline opacity-30"></span>
			<span class="font-grotesk text-xs text-on-surface-dim tracking-[0.1em] uppercase">
				{pageName}
			</span>
		</div>
		<div class="flex items-center gap-4">
			<!-- Right slot: auth/login goes here once implemented -->
		</div>
	</header>

	<main>
		{@render children()}
	</main>
</div>
