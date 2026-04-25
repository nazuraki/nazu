<script lang="ts">
	import '../app.css';

	const { children } = $props();

	const nav = [
		{ href: '/',          label: 'Home' },
		{ href: '/nazu',       label: 'Nazu' },
		{ href: '/dashboard',  label: 'Dashboard' },
		{ href: '/librarian', label: 'Librarian' },
	];
</script>

<div class="shell">
	<nav class="sidebar">
		<span class="wordmark">nazu</span>
		<ul>
			{#each nav as { href, label } (href)}
				<li><a {href}>{label}</a></li>
			{/each}
		</ul>
	</nav>

	<main class="content">
		{@render children()}
	</main>
</div>

<style>
	.shell {
		display: flex;
		min-height: 100dvh;
	}

	.sidebar {
		width: 200px;
		flex-shrink: 0;
		background: var(--color-surface-container);
		padding: var(--space-6) var(--space-4);
		display: flex;
		flex-direction: column;
		gap: var(--space-6);
	}

	.wordmark {
		font-family: var(--font-display);
		font-weight: 700;
		font-size: var(--text-h3);
		color: var(--color-primary);
		letter-spacing: -0.02em;
	}

	ul {
		list-style: none;
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}

	a {
		display: block;
		padding: var(--space-2) var(--space-3);
		border-radius: var(--radius-md);
		font-family: var(--font-display);
		font-size: var(--text-sm);
		color: var(--color-on-surface-variant);
		transition: background var(--transition-fast), color var(--transition-fast);
	}

	a:hover {
		background: var(--color-primary-container);
		color: var(--color-primary);
		text-decoration: none;
	}

	.content {
		flex: 1;
		padding: var(--space-8);
	}
</style>
