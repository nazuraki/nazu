import { json } from '@sveltejs/kit';
import { getGitHub } from '$lib/server/github/index.js';
import { fetchOrgRepos, fetchUserRepos } from '$lib/server/github/queries.js';

export async function GET() {
	const { github, owners } = getGitHub();
	const [personal, org] = await Promise.all([
		fetchUserRepos(github, owners.user),
		fetchOrgRepos(github, owners.org),
	]);
	const all = [...personal, ...org].sort((a, b) => a.full_name.localeCompare(b.full_name));
	return json(all);
}
