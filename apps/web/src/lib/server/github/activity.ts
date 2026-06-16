import { getPagesWorkflow, getStatusWorkflow } from '$lib/server/repoconfig.js';
import type { GitHubClient } from './client.js';
import { fetchOpenIssues, fetchOpenPRs, fetchRecentRuns } from './queries.js';
import type { Issue, PullRequest, Repo, WorkflowRun } from './types.js';

export interface RepoActivity {
	full_name: string;
	issues: Issue[];
	prs: PullRequest[];
	latestRun: {
		name: string | null;
		conclusion: string | null;
		status: string | null;
		html_url: string;
	} | null;
	pagesRun: { conclusion: string | null; status: string | null; html_url: string } | null;
}

export interface ActivityResult {
	activity: RepoActivity[];
	/** True when any per-repo fetch failed and that card's data is incomplete. */
	degraded: boolean;
}

/**
 * Build per-repo dashboard activity (open issues, PRs, latest CI + pages runs).
 * Every GitHub call is wrapped so a single repo's transient failure degrades
 * that card to empty data and flips `degraded` — it never throws.
 */
export async function buildActivity(client: GitHubClient, repos: Repo[]): Promise<ActivityResult> {
	const noRuns: WorkflowRun[] = [];
	let degraded = false;

	// The status workflow is repo-invariant — resolve it once, not per repo.
	const statusWorkflow = await getStatusWorkflow();

	const activity = await Promise.all(
		repos.map(async (repo): Promise<RepoActivity> => {
			const [owner, name] = repo.full_name.split("/");
			const pagesWorkflow = await getPagesWorkflow(repo.full_name);

			const [issues, prs, statusRuns, pagesRuns] = await Promise.all([
				fetchOpenIssues(client, owner, name).catch(() => {
					degraded = true;
					return [] as Issue[];
				}),
				fetchOpenPRs(client, owner, name).catch(() => {
					degraded = true;
					return [] as PullRequest[];
				}),
				fetchRecentRuns(client, owner, name, 1, statusWorkflow).catch(() => noRuns),
				pagesWorkflow
					? fetchRecentRuns(client, owner, name, 1, pagesWorkflow).catch(() => noRuns)
					: Promise.resolve(noRuns),
			]);

			const latestRun = statusRuns[0]
				? {
						name: statusRuns[0].name,
						conclusion: statusRuns[0].conclusion,
						status: statusRuns[0].status,
						html_url: statusRuns[0].html_url,
					}
				: null;
			const pagesRun = pagesRuns[0]
				? {
						conclusion: pagesRuns[0].conclusion,
						status: pagesRuns[0].status,
						html_url: pagesRuns[0].html_url,
					}
				: null;

			return { full_name: repo.full_name, issues, prs, latestRun, pagesRun };
		})
	);

	return { activity, degraded };
}
