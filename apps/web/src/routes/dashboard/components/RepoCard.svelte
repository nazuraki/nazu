<script lang="ts">
import type { Issue, PullRequest, Repo, RepoActivity, RepoCompliance } from '$lib/dashboard/api.js';
import { isLinked, sortIssues } from '$lib/priority.js';
import { timeAgo } from '$lib/time.js';

const ISSUE_LIMIT = 6;

const COMPLIANCE_LABELS: Record<string, string> = {
	readme: "README.md",
	purpose: "docs/PURPOSE.md",
	gitignore: ".gitignore",
	justfile: "Justfile",
	ci: ".github/workflows/ci.yml",
};

const {
	repo,
	activity,
	compliance,
	changedAt,
}: { repo: Repo; activity?: RepoActivity; compliance?: RepoCompliance; changedAt?: number } =
	$props();

const missingCount = $derived(compliance?.missing.length ?? 0);
const missingRecipes = $derived(compliance?.justfile_missing_recipes ?? []);
const totalRules = 5;
const passing = $derived(totalRules - missingCount);
const allPass = $derived(missingCount === 0 && missingRecipes.length === 0);
const complianceTitle = $derived(
	compliance
		? allPass
			? "All standards met"
			: [
					missingCount > 0
						? `Missing: ${compliance.missing.map((k) => COMPLIANCE_LABELS[k]).join(", ")}`
						: "",
					missingRecipes.length > 0 ? `Missing recipes: ${missingRecipes.join(", ")}` : "",
				]
					.filter(Boolean)
					.join(" | ")
		: ""
);

// biome-ignore lint/style/useConst: bind:this requires let
let cardEl = $state<HTMLDivElement | null>(null);

$effect(() => {
	if (!changedAt || !cardEl) return;
	cardEl.classList.remove("changed");
	void cardEl.offsetWidth;
	cardEl.classList.add("changed");
});

const [owner, name] = $derived(repo.full_name.split("/"));

const sorted = $derived(activity ? sortIssues(activity.issues, activity.prs) : []);
const visible = $derived(sorted.slice(0, ISSUE_LIMIT));
const overflow = $derived(Math.max(0, sorted.length - ISSUE_LIMIT));
const prCount = $derived(activity?.prs.length ?? 0);

function buildStatusColor(conclusion: string | null | undefined): string {
	if (conclusion === "success") return "var(--success)";
	if (conclusion === "failure" || conclusion === "timed_out" || conclusion === "startup_failure")
		return "var(--error)";
	return "transparent";
}

const borderColor = $derived(buildStatusColor(activity?.latestRun?.conclusion));

function pagesIconColor(conclusion: string | null | undefined): string {
	if (conclusion === "success") return "var(--success)";
	if (conclusion === "failure" || conclusion === "timed_out") return "var(--error)";
	if (conclusion == null) return "var(--on-surface-dim)";
	return "var(--outline)";
}

const pagesColor = $derived(pagesIconColor(activity?.pagesRun?.conclusion));

const LABEL_ABBREVS: Record<string, string> = {
	enhancement: "enh",
	enhancements: "enh",
	"nice to have": "nice",
	feature: "feat",
	"feature request": "feat",
	bug: "bug",
	documentation: "docs",
	"good first issue": "gfi",
	"help wanted": "help",
	question: "?",
	wontfix: "wontfix",
	duplicate: "dup",
	invalid: "invalid",
	performance: "perf",
	refactor: "refactor",
	security: "sec",
	test: "test",
	chore: "chore",
	"breaking change": "breaking",
};

function abbreviateLabel(name: string): string {
	return LABEL_ABBREVS[name.toLowerCase()] ?? name;
}
</script>

<div class="card" style="border-left-color: {borderColor}" bind:this={cardEl}>
  {#if repo.private}
    <svg class="lock-bg" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M11.5 6H11V4.5a3 3 0 0 0-6 0V6H4.5A1.5 1.5 0 0 0 3 7.5v5A1.5 1.5 0 0 0 4.5 14h7a1.5 1.5 0 0 0 1.5-1.5v-5A1.5 1.5 0 0 0 11.5 6ZM6 4.5a2 2 0 1 1 4 0V6H6ZM8 11a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z"/>
    </svg>
  {/if}
  <div class="top">
    <a href={repo.html_url} target="_blank" rel="noopener noreferrer" class="title-link">
      <span class="title">
        <span class="owner">{owner}</span>
        <span class="sep"> // </span>
        <span class="name">{name}</span>
      </span>
    </a>
    <div class="top-right">
      {#if activity?.pagesRun}
        <a href={activity.pagesRun.html_url} target="_blank" rel="noopener noreferrer" class="pages-icon" style="color: {pagesColor}" title="Pages: {activity.pagesRun.conclusion ?? activity.pagesRun.status ?? 'pending'}">
          <i class="nf nf-md-web"></i>
        </a>
      {/if}
      {#if compliance}
        <span
          class="pill compliance"
          class:all-pass={allPass}
          class:some-fail={!allPass && missingCount < totalRules}
          class:all-fail={missingCount === totalRules}
          title={complianceTitle}
        >{passing}/{totalRules}</span>
      {/if}
      {#if prCount > 0}
        <span class="pill prs">{prCount} PR{prCount === 1 ? '' : 's'}</span>
      {/if}
      <span class="pushed">{timeAgo(repo.pushed_at)}</span>
    </div>
  </div>

  {#if visible.length > 0}
    <ul class="issues">
      {#each visible as issue (issue.id)}
        {@const linked = activity ? isLinked(issue, activity.prs) : false}
        <li>
          <a href={issue.html_url} target="_blank" rel="noopener noreferrer" class="issue-row">
            <span class="issue-num">#{issue.number}</span>
            <span class="issue-title">{issue.title}</span>
            <div class="issue-meta">
              {#if linked}
                <span class="indicator pr-linked" title="Has linked PR"><i class="nf nf-cod-git_pull_request"></i></span>
              {/if}
              {#if issue.comments > 0}
                <span class="comment-count" title="{issue.comments} comment{issue.comments === 1 ? '' : 's'}"><i class="nf nf-cod-comment"></i> {issue.comments}</span>
              {/if}
              {#each issue.labels.slice(0, 2) as label}
                <span class="label-chip" style="background: #{label.color}22; color: #{label.color}">{abbreviateLabel(label.name)}</span>
              {/each}
            </div>
          </a>
        </li>
      {/each}
    </ul>
    {#if overflow > 0}
      <a href="{repo.html_url}/issues" target="_blank" rel="noopener noreferrer" class="overflow-link">{overflow} more...</a>
    {/if}
  {:else if activity}
    <p class="no-issues">No open issues</p>
  {/if}
</div>

<style>
  @keyframes flash-fade {
    0%   { background: color-mix(in srgb, var(--primary) 20%, var(--surface-1)); }
    100% { background: var(--surface-1); }
  }

  .card {
    position: relative;
    display: flex;
    flex-direction: column;
    background: var(--surface-1);
    border-radius: 4px;
    border-left: 3px solid transparent;
    transition: background 0.15s;
    overflow: hidden;
  }

  .card:global(.changed) { animation: flash-fade 30s ease-out forwards; }
  .card:hover { background: var(--surface-2); }

  .top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    padding: 0.625rem 0.75rem 0.5rem 0.875rem;
  }

  .title-link { color: inherit; text-decoration: none; overflow: hidden; }
  .title-link:hover { text-decoration: none; }

  .title {
    font-family: var(--font-display);
    font-size: 0.875rem;
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .owner { color: var(--on-surface-dim); }
  .sep   { color: var(--outline); }
  .name  { color: var(--on-surface); }

  .top-right { display: flex; align-items: center; gap: 0.375rem; flex-shrink: 0; }

  .pages-icon { font-size: 0.75rem; text-decoration: none; line-height: 1; }

  .pill.compliance {
    font-family: var(--font-display);
    font-size: 0.5625rem;
    font-weight: 700;
    letter-spacing: 0.06em;
    padding: 0.125rem 0.375rem;
    border-radius: 4px;
    cursor: default;
  }

  .pill.compliance.all-pass  { background: color-mix(in srgb, var(--success) 15%, transparent); color: var(--success); }
  .pill.compliance.some-fail { background: color-mix(in srgb, var(--warning) 15%, transparent); color: var(--warning); }
  .pill.compliance.all-fail  { background: color-mix(in srgb, var(--error) 15%, transparent); color: var(--error); }

  .pill.prs {
    font-family: var(--font-display);
    font-size: 0.5625rem;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    padding: 0.125rem 0.375rem;
    border-radius: 4px;
    background: color-mix(in srgb, var(--primary) 15%, transparent);
    color: var(--primary);
  }

  .lock-bg {
    position: absolute;
    top: 0;
    left: -0.25rem;
    width: 2rem;
    height: 2rem;
    color: var(--on-surface);
    opacity: 0.12;
    pointer-events: none;
    rotate: -25deg;
  }

  .pushed { font-size: 0.6875rem; color: var(--on-surface-dim); white-space: nowrap; }

  .issues { list-style: none; border-top: 1px solid var(--surface-2); }

  .issue-row {
    display: grid;
    grid-template-columns: 1.5rem 1fr auto;
    align-items: baseline;
    gap: 0.375rem;
    padding: 0.3rem 0.75rem 0.3rem 0.875rem;
    color: inherit;
    text-decoration: none;
    transition: background 0.1s;
  }

  .issue-row:hover { background: var(--surface-3); text-decoration: none; }

  .issue-num {
    font-family: var(--font-display);
    font-size: 0.6875rem;
    font-weight: 600;
    color: var(--on-surface-dim);
    text-align: right;
  }

  .issue-title {
    font-size: 0.75rem;
    color: var(--on-surface);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .issue-meta { display: flex; align-items: center; gap: 0.25rem; flex-shrink: 0; }

  .indicator.pr-linked { color: var(--primary); font-size: 0.75rem; }

  .comment-count { font-size: 0.625rem; color: var(--on-surface-dim); white-space: nowrap; }

  .label-chip {
    font-family: var(--font-display);
    font-size: 0.5rem;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    padding: 0.1rem 0.3rem;
    border-radius: 4px;
    white-space: nowrap;
  }

  .overflow-link {
    display: block;
    padding: 0.3rem 0.875rem;
    font-size: 0.6875rem;
    color: var(--on-surface-dim);
    text-decoration: none;
    border-top: 1px solid var(--surface-2);
  }

  .overflow-link:hover { color: var(--secondary); text-decoration: none; }

  .no-issues {
    padding: 0.375rem 0.875rem 0.5rem;
    font-size: 0.75rem;
    color: var(--outline);
    border-top: 1px solid var(--surface-2);
  }
</style>
