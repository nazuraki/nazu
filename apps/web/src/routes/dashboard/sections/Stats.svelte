<script lang="ts">
import Gauge from '../components/Gauge.svelte';
import LineChart from '../components/LineChart.svelte';
import { type NazuTopic, type StewardStats, type DockerContainer, api } from '$lib/dashboard/api.js';

let stats = $state<StewardStats | null>(null);
let topics = $state<NazuTopic[]>([]);
let containers = $state<DockerContainer[]>([]);
let error = $state<string | null>(null);

async function load() {
	try {
		const [s, t, d] = await Promise.all([api.stewardStats(), api.nazuProjects(), api.docker()]);
		stats = s;
		topics = t;
		containers = d;
		error = null;
	} catch (e) {
		error = e instanceof Error ? e.message : "Failed to load";
	}
}

$effect(() => {
	load();
	const interval = setInterval(load, 60_000);
	return () => clearInterval(interval);
});

function successColor(rate: number): string {
	if (rate > 90) return "var(--success)";
	if (rate > 75) return "var(--warning)";
	if (rate > 50) return "var(--caution)";
	return "var(--error)";
}

function budgetColor(cost: number, budget: number): string {
	const pct = (cost / budget) * 100;
	if (pct < 50) return "var(--success)";
	if (pct < 75) return "var(--warning)";
	if (pct < 90) return "var(--caution)";
	return "var(--error)";
}
</script>

<div class="section">
  <header>
    <span class="label">Steward</span>
  </header>

  {#if error}
    <p class="state-msg error">{error}</p>
  {:else if stats}
    <div class="gauges">
      <Gauge
        value={stats.totalCost}
        max={stats.budget}
        label="Cost / Budget"
        displayValue="${stats.totalCost.toFixed(2)}"
        maxLabel="${stats.budget}"
        color={budgetColor(stats.totalCost, stats.budget)}
      />
      <Gauge
        value={stats.successRate}
        max={100}
        label="Success Rate"
        displayValue="{stats.successRate}%"
        maxLabel="100%"
        color={successColor(stats.successRate)}
      />
    </div>

    <div class="chart-section">
      <span class="section-label">Daily Tokens</span>
      <LineChart data={stats.dailyTokens} />
    </div>

    <div class="scroll-area">
      <header class="tasks-header">
        <span class="label">Tasks</span>
      </header>
      <div class="tasks">
        {#each topics as topic (topic.topic)}
          <div class="topic">
            <span class="topic-name">{topic.topic}</span>
            {#each topic.tasks as task (task.id)}
              <div class="task" class:high={task.priority === 'high'} class:medium={task.priority === 'medium'}>
                <span class="task-dot" class:high={task.priority === 'high'} class:medium={task.priority === 'medium'}></span>
                <span class="task-title">{task.title}</span>
              </div>
            {/each}
          </div>
        {/each}
      </div>

      {#if containers.length > 0}
        <header class="containers-header">
          <span class="label">Containers</span>
        </header>
        <div class="containers">
          {#each containers as c (c.name)}
            <a class="container-row" href="/logs/{c.id}">
              <span class="container-dot" class:running={c.state === 'running'} class:stopped={c.state !== 'running'}></span>
              <span class="container-name">{c.name}</span>
              <span class="container-status">{c.status}</span>
            </a>
          {/each}
        </div>
      {/if}
    </div>
  {:else}
    <p class="state-msg">Loading...</p>
  {/if}
</div>

<style>
  .section {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
    padding: 1.5rem 1.25rem 0;
  }

  header { margin-bottom: 1rem; flex-shrink: 0; }

  .label {
    font-family: var(--font-display);
    font-size: 0.6875rem;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--on-surface-dim);
  }

  .section-label {
    display: block;
    font-family: var(--font-display);
    font-size: 0.5625rem;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--outline);
    margin-bottom: 0.375rem;
  }

  .gauges {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.5rem;
    margin-bottom: 1.25rem;
    flex-shrink: 0;
  }

  .chart-section { margin-bottom: 1.25rem; flex-shrink: 0; }

  .scroll-area {
    flex: 1;
    overflow-y: auto;
    padding-bottom: 1.5rem;
  }

  .tasks-header { margin-bottom: 0.625rem; }

  .tasks {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    margin-bottom: 1.5rem;
  }

  .containers-header { margin-bottom: 0.5rem; }

  .containers {
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
  }

  .container-row {
    display: grid;
    grid-template-columns: 0.5rem 1fr auto;
    text-decoration: none;
    align-items: center;
    gap: 0.4rem;
    padding: 0.2rem 0.25rem;
    border-radius: 4px;
  }

  .container-row:hover { background: var(--surface-3); }

  .container-dot {
    width: 0.3rem;
    height: 0.3rem;
    border-radius: 50%;
    background: var(--outline);
    flex-shrink: 0;
  }

  .container-dot.running { background: var(--success); }
  .container-dot.stopped { background: var(--error); }

  .container-name {
    font-size: 0.6875rem;
    color: var(--on-surface);
    font-family: var(--font-mono, monospace);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .container-status {
    font-size: 0.5625rem;
    color: var(--on-surface-dim);
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
  }

  .topic { display: flex; flex-direction: column; gap: 0.125rem; }

  .topic-name {
    font-family: var(--font-display);
    font-size: 0.5625rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--outline);
    margin-bottom: 0.25rem;
  }

  .task {
    display: grid;
    grid-template-columns: 0.5rem 1fr;
    align-items: baseline;
    gap: 0.4rem;
    padding: 0.2rem 0.25rem;
    border-radius: 4px;
  }

  .task:hover { background: var(--surface-3); }

  .task-dot {
    width: 0.3rem;
    height: 0.3rem;
    border-radius: 50%;
    background: var(--outline);
    flex-shrink: 0;
    margin-top: 0.2rem;
  }

  .task-dot.high   { background: var(--secondary); }
  .task-dot.medium { background: var(--warning); }

  .task-title { font-size: 0.6875rem; color: var(--on-surface); line-height: 1.4; }

  .task.high   .task-title { color: var(--on-surface); }
  .task.medium .task-title { color: var(--on-surface-dim); }

  .state-msg { font-size: 0.875rem; color: var(--on-surface-dim); }
  .state-msg.error { color: var(--error); }
</style>
