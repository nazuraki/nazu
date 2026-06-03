import { error } from '@sveltejs/kit';
import { getSection } from '$lib/server/settings.js';
import { GitHubClient } from './client.js';

/**
 * Build a GitHub client from DB-backed settings. Config is cached by the
 * settings store, so constructing the client per call is cheap and picks up
 * changes made in the UI without a restart.
 */
export async function getGitHub() {
	const g = await getSection('github');
	const user = (g.user as string)?.trim();
	const org = (g.org as string)?.trim();
	const personalToken = (g.personalToken as string)?.trim();
	const orgToken = (g.orgToken as string)?.trim();
	const apiBaseUrl = (g.apiBaseUrl as string)?.trim();

	if (!user || !personalToken) {
		throw error(503, 'GitHub is not configured — set tokens in Settings');
	}

	const tokens: Record<string, string> = { [user]: personalToken };
	if (org && orgToken) tokens[org] = orgToken;

	return {
		github: new GitHubClient(tokens, apiBaseUrl),
		owners: { user, org },
	};
}
