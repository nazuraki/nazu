import { json } from '@sveltejs/kit';
import { getGitHub } from '$lib/server/github/index.js';
import { getAllRepos } from '$lib/server/github/repos.js';
import { scoreRepo, unknownScore } from '$lib/server/report-card/score.js';
import type { ReportCardResponse } from '$lib/report-card.js';

export async function GET() {
	const { github, owners } = await getGitHub();
	const { repos, stale, error } = await getAllRepos(github, owners);

	const scores = await Promise.all(
		repos.map((repo) =>
			scoreRepo(github, repo).catch(() => unknownScore(repo, 'Could not score this repo'))
		)
	);

	const body: ReportCardResponse = { repos: scores, stale, error };
	return json(body);
}
