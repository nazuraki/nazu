import { json } from '@sveltejs/kit';
import { getGitHub } from '$lib/server/github/index.js';
import { buildActivity } from '$lib/server/github/activity.js';
import { getAllRepos } from '$lib/server/github/repos.js';

export async function GET() {
	const { github, owners } = await getGitHub();
	const { repos, stale, error } = await getAllRepos(github, owners);
	const { activity, degraded } = await buildActivity(github, repos);

	return json({
		activity,
		stale: stale || degraded,
		error: stale ? error : degraded ? "Some GitHub data could not be refreshed" : null,
	});
}
