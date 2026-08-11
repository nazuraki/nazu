<script lang="ts">
import { areaStatus, CHECKLIST, type AreaDef, type RepoScore } from '$lib/report-card.js';

const { repos }: { repos: RepoScore[] } = $props();

const GLYPH = { pass: '✓', fail: '✕', unknown: '?' } as const;

function cellTitle(area: AreaDef, score: RepoScore): string {
	return area.checks
		.map((check) => {
			const result = score.checks[check.id];
			const glyph = GLYPH[result?.status ?? 'unknown'];
			const note = result?.note ? ` — ${result.note}` : '';
			return `${glyph} ${check.label}${note}`;
		})
		.join('\n');
}

function areaScore(area: AreaDef, score: RepoScore): string {
	const passed = area.checks.filter((c) => score.checks[c.id]?.status === 'pass').length;
	return `${passed}/${area.checks.length}`;
}
</script>

<div class="table-wrap">
	<table>
		<thead>
			<tr>
				<th class="repo-col">Repository</th>
				{#each CHECKLIST as area (area.id)}
					<th>{area.title}</th>
				{/each}
				<th class="score-col">Score</th>
			</tr>
		</thead>
		<tbody>
			{#each repos as score (score.full_name)}
				<tr>
					<td class="repo-col">
						<a href={score.html_url} target="_blank" rel="noopener">{score.full_name}</a>
					</td>
					{#each CHECKLIST as area (area.id)}
						<td class="cell {areaStatus(area, score)}" title={cellTitle(area, score)}>
							{areaScore(area, score)}
						</td>
					{/each}
					<td class="score-col total">{score.passed}/{score.total}</td>
				</tr>
			{/each}
		</tbody>
	</table>
</div>

<style>
	.table-wrap {
		overflow-x: auto;
		border: 1px solid var(--surface-3);
		border-radius: 8px;
	}

	table {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.8125rem;
	}

	th {
		font-family: var(--font-display);
		font-size: 0.625rem;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--on-surface-dim);
		text-align: center;
		padding: 0.6rem 0.5rem;
		background: var(--surface-1);
		white-space: nowrap;
	}

	td {
		padding: 0.5rem;
		text-align: center;
		border-top: 1px solid var(--surface-2);
		font-variant-numeric: tabular-nums;
	}

	.repo-col {
		text-align: left;
		padding-left: 0.85rem;
	}

	td.repo-col a {
		color: var(--on-surface);
		text-decoration: none;
	}

	td.repo-col a:hover {
		color: var(--primary);
	}

	.cell.pass { color: var(--success); }
	.cell.fail { color: var(--error); }
	.cell.unknown { color: var(--on-surface-dim); }

	.score-col {
		font-weight: 600;
	}

	td.total {
		color: var(--primary);
	}

	tbody tr:hover td {
		background: var(--surface-1);
	}
</style>
