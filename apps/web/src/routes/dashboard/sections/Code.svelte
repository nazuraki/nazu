<script lang="ts">
import RepoCard from '../components/RepoCard.svelte';
import { type Repo, type RepoActivity, type RepoCompliance, api } from '$lib/dashboard/api.js';
import { SvelteMap } from 'svelte/reactivity';

let repos = $state<Repo[]>([]);
let activity = new SvelteMap<string, RepoActivity>();
let compliance = new SvelteMap<string, RepoCompliance>();
let changedAt = new SvelteMap<string, number>();
let error = $state<string | null>(null);
let loading = $state(true);

function fingerprint(repo: Repo, act?: RepoActivity): string {
	return [
		repo.pushed_at ?? "",
		act?.issues.length ?? 0,
		act?.prs.length ?? 0,
		act?.latestRun?.conclusion ?? "",
		act?.latestRun?.status ?? "",
		act?.pagesRun?.conclusion ?? "",
	].join("|");
}

const prevFingerprints = new SvelteMap<string, string>();

async function loadCompliance() {
	try {
		const list = await api.compliance();
		compliance.clear();
		for (const c of list) compliance.set(c.full_name, c);
	} catch {
		// non-critical — card renders fine without it
	}
}

async function load() {
	try {
		const [repoList, activityList] = await Promise.all([api.repos(), api.activity()]);

		if (!loading) {
			const now = Date.now();
			for (const repo of repoList) {
				const fp = fingerprint(repo, activityList.find((a) => a.full_name === repo.full_name));
				const prev = prevFingerprints.get(repo.full_name);
				if (prev !== undefined && prev !== fp) {
					changedAt.set(repo.full_name, now);
				}
			}
		}

		for (const repo of repoList) {
			prevFingerprints.set(repo.full_name, fingerprint(repo, activityList.find((a) => a.full_name === repo.full_name)));
		}

		activity.clear();
		for (const a of activityList) activity.set(a.full_name, a);

		repos = repoList;
		error = null;
	} catch (e) {
		error = e instanceof Error ? e.message : "Failed to load";
	} finally {
		loading = false;
	}
}

$effect(() => {
	load();
	loadCompliance();
	const interval = setInterval(load, 60_000);
	return () => clearInterval(interval);
});
</script>

<div class="section">
  <header>
    <span class="label">Projects</span>
    {#if repos.length}
      <span class="count">{repos.length} repos</span>
    {/if}
  </header>

  <div class="content">
    {#if loading}
      <p class="state-msg">Loading...</p>
    {:else if error}
      <p class="state-msg error">{error}</p>
    {:else}
      <div class="grid">
        {#each repos as repo (repo.id)}
          <RepoCard {repo} activity={activity.get(repo.full_name)} compliance={compliance.get(repo.full_name)} changedAt={changedAt.get(repo.full_name)} />
        {/each}
      </div>
    {/if}
  </div>
</div>

<style>
  .section {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
    padding: 1.5rem 1.5rem 0;
  }

  header {
    display: flex;
    align-items: baseline;
    gap: 1rem;
    margin-bottom: 1rem;
    flex-shrink: 0;
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
    font-weight: 400;
    color: var(--outline);
  }

  .content { flex: 1; overflow-y: auto; padding-bottom: 1.5rem; }

  .state-msg { color: var(--on-surface-dim); font-size: 0.875rem; }
  .state-msg.error { color: var(--secondary); }

  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    gap: 0.75rem;
  }
</style>
