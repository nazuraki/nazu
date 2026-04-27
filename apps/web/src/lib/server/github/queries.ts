import type { GitHubClient } from './client.js';
import type { Issue, PullRequest, Repo, WorkflowRun } from './types.js';

export async function fetchUserRepos(client: GitHubClient, user: string): Promise<Repo[]> {
	const repos = await client.paginate<Repo>(user, "/user/repos", { affiliation: "owner", sort: "pushed" });
	return repos.filter((r) => !r.archived);
}

export async function fetchOrgRepos(client: GitHubClient, org: string): Promise<Repo[]> {
	const repos = await client.paginate<Repo>(org, `/orgs/${org}/repos`, { type: "all", sort: "pushed" });
	return repos.filter((r) => !r.archived);
}

export async function fetchOpenIssues(
	client: GitHubClient,
	owner: string,
	repo: string
): Promise<Issue[]> {
	const items = await client.paginate<Issue>(owner, `/repos/${owner}/${repo}/issues`, {
		state: "open",
	});
	// GitHub issues API includes PRs — filter them out
	return items.filter((i) => !i.pull_request);
}

export async function fetchOpenPRs(
	client: GitHubClient,
	owner: string,
	repo: string
): Promise<PullRequest[]> {
	return client.paginate<PullRequest>(owner, `/repos/${owner}/${repo}/pulls`, { state: "open" });
}

export async function fetchRecentRuns(
	client: GitHubClient,
	owner: string,
	repo: string,
	limit = 10,
	workflow?: string
): Promise<WorkflowRun[]> {
	const path = workflow
		? `/repos/${owner}/${repo}/actions/workflows/${workflow}/runs`
		: `/repos/${owner}/${repo}/actions/runs`;
	const data = await client.get<{ workflow_runs: WorkflowRun[] }>(owner, path, {
		per_page: String(limit),
	});
	return data.workflow_runs;
}

export async function fetchFileContent(
	client: GitHubClient,
	owner: string,
	repo: string,
	path: string
): Promise<string | null> {
	try {
		const data = await client.get<{ content: string; encoding: string }>(
			owner,
			`/repos/${owner}/${repo}/contents/${path}`
		);
		if (data.encoding !== "base64") return null;
		return Buffer.from(data.content.replace(/\n/g, ""), "base64").toString("utf-8");
	} catch {
		return null;
	}
}

export async function fetchRepoTree(
	client: GitHubClient,
	owner: string,
	repo: string
): Promise<Set<string>> {
	try {
		const data = await client.get<{ tree: { path: string }[] }>(
			owner,
			`/repos/${owner}/${repo}/git/trees/HEAD`,
			{ recursive: "1" }
		);
		return new Set(data.tree.map((f) => f.path));
	} catch {
		return new Set();
	}
}
