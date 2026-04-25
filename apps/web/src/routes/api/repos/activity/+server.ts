import { json } from '@sveltejs/kit';
import { getGitHub } from '$lib/server/github/index.js';
import { fetchOpenIssues, fetchOpenPRs, fetchOrgRepos, fetchRecentRuns, fetchUserRepos } from '$lib/server/github/queries.js';
import { getPagesWorkflow, getStatusWorkflow } from '$lib/server/repoconfig.js';

export async function GET() {
	const { github, owners } = getGitHub();
	const [personal, org] = await Promise.all([
		fetchUserRepos(github, owners.user),
		fetchOrgRepos(github, owners.org),
	]);
	const all = [...personal, ...org];

	const noRuns: Awaited<ReturnType<typeof fetchRecentRuns>> = [];

	const activity = await Promise.all(
		all.map(async (repo) => {
			const [owner, name] = repo.full_name.split("/");
			const statusWorkflow = getStatusWorkflow(repo.full_name);
			const pagesWorkflow = getPagesWorkflow(repo.full_name);
			const [issues, prs, statusRuns, pagesRuns] = await Promise.all([
				fetchOpenIssues(github, owner, name),
				fetchOpenPRs(github, owner, name),
				fetchRecentRuns(github, owner, name, 1, statusWorkflow).catch(() => noRuns),
				pagesWorkflow
					? fetchRecentRuns(github, owner, name, 1, pagesWorkflow).catch(() => noRuns)
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

	return json(activity);
}
