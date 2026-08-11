<svelte:head>
	<title>report card — nazuraki.dev</title>
</svelte:head>

<script lang="ts">
import ScoreTable from './ScoreTable.svelte';
import { CHECKLIST, type ReportCardResponse } from '$lib/report-card.js';

let data = $state<ReportCardResponse | null>(null);
let error = $state<string | null>(null);
let loading = $state(true);

async function load() {
	try {
		const res = await fetch('/api/repos/report-card');
		if (!res.ok) throw new Error(`API ${res.status}: /api/repos/report-card`);
		data = (await res.json()) as ReportCardResponse;
		error = null;
	} catch (e) {
		error = e instanceof Error ? e.message : 'Failed to load';
	} finally {
		loading = false;
	}
}

$effect(() => {
	load();
});
</script>

<div class="report-card">
	<section>
		<header>
			<span class="label">Report Card</span>
			{#if data?.repos.length}
				<span class="count">{data.repos.length} repos</span>
			{/if}
		</header>

		{#if loading}
			<p class="state-msg">Scoring repositories… this fans out over the GitHub API and can take a few seconds.</p>
		{:else if error}
			<p class="state-msg error">{error}</p>
		{:else if data}
			{#if data.stale}
				<p class="state-msg stale">⚠ {data.error ?? 'GitHub data may be out of date.'}</p>
			{/if}
			<ScoreTable repos={data.repos} />
		{/if}
	</section>

	<section>
		<header>
			<span class="label">The Checklist</span>
			<span class="count">from the project-standards audit</span>
		</header>
		<div class="checklist">
			{#each CHECKLIST as area (area.id)}
				<article class="area">
					<h3>{area.title}</h3>
					<p class="area-desc">{area.description}</p>
					<ul>
						{#each area.checks as check (check.id)}
							<li>
								<span class="check-label">{check.label}</span>
								<span class="check-desc">{check.description}</span>
							</li>
						{/each}
					</ul>
				</article>
			{/each}
		</div>
	</section>
</div>

<style>
	/* Same sysctl-var bridge as the dashboard — components use --surface-1 etc. */
	.report-card {
		--bg:             #0e0e10;
		--surface-0:      #131315;
		--surface-1:      #1b1b1d;
		--surface-2:      #201f21;
		--surface-3:      #2a2a2c;
		--primary:        #cebdff;
		--secondary:      #ff9bbb;
		--on-surface:     #e6e3e8;
		--on-surface-dim: #938f99;
		--outline:        #47464a;
		--success:        #6fcf97;
		--warning:        #f2c94c;
		--caution:        #f2994a;
		--error:          #eb5757;
		--font-display:   'Space Grotesk', system-ui, sans-serif;
		--font-body:      'Inter', system-ui, sans-serif;

		min-height: calc(100vh - 3rem);
		background: var(--bg);
		color: var(--on-surface);
		font-family: var(--font-body);
		padding: 1.5rem;
		display: flex;
		flex-direction: column;
		gap: 2rem;
	}

	header {
		display: flex;
		align-items: baseline;
		gap: 1rem;
		margin-bottom: 1rem;
	}

	.label {
		font-family: var(--font-display);
		font-size: 0.6875rem;
		font-weight: 700;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--on-surface-dim);
	}

	.count {
		font-family: var(--font-display);
		font-size: 0.6875rem;
		color: var(--outline);
	}

	.state-msg { color: var(--on-surface-dim); font-size: 0.875rem; }
	.state-msg.error { color: var(--secondary); }
	.state-msg.stale { color: var(--caution); margin-bottom: 0.75rem; }

	.checklist {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
		gap: 0.75rem;
	}

	.area {
		background: var(--surface-1);
		border: 1px solid var(--surface-3);
		border-radius: 8px;
		padding: 1rem;
	}

	.area h3 {
		font-family: var(--font-display);
		font-size: 0.875rem;
		font-weight: 600;
		color: var(--primary);
		margin: 0 0 0.35rem;
	}

	.area-desc {
		font-size: 0.75rem;
		color: var(--on-surface-dim);
		margin: 0 0 0.75rem;
		line-height: 1.5;
	}

	.area ul {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}

	.area li {
		font-size: 0.75rem;
		line-height: 1.45;
	}

	.check-label {
		font-weight: 600;
		color: var(--on-surface);
	}

	.check-label::after {
		content: ' — ';
		color: var(--on-surface-dim);
		font-weight: 400;
	}

	.check-desc {
		color: var(--on-surface-dim);
	}
</style>
