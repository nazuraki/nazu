import { env } from '$env/dynamic/private';
import { GitHubClient } from './client.js';

let _client: { github: GitHubClient; owners: { user: string; org: string } } | undefined;

export function getGitHub() {
	if (!_client) {
		const { PERSONAL_GITHUB_TOKEN, LOREARC_GITHUB_TOKEN, GITHUB_USER, GITHUB_ORG } = env;
		if (!PERSONAL_GITHUB_TOKEN) throw new Error("Missing env: PERSONAL_GITHUB_TOKEN");
		if (!LOREARC_GITHUB_TOKEN) throw new Error("Missing env: LOREARC_GITHUB_TOKEN");
		if (!GITHUB_USER) throw new Error("Missing env: GITHUB_USER");
		if (!GITHUB_ORG) throw new Error("Missing env: GITHUB_ORG");
		_client = {
			github: new GitHubClient({
				[GITHUB_USER]: PERSONAL_GITHUB_TOKEN,
				[GITHUB_ORG]: LOREARC_GITHUB_TOKEN,
			}),
			owners: { user: GITHUB_USER, org: GITHUB_ORG },
		};
	}
	return _client;
}
