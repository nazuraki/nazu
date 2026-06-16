import { json } from '@sveltejs/kit';
import { getGitHub } from '$lib/server/github/index.js';
import { getAllRepos } from '$lib/server/github/repos.js';

export async function GET() {
	const { github, owners } = await getGitHub();
	const result = await getAllRepos(github, owners);
	return json(result);
}
