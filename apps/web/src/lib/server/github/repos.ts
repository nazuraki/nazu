import type { GitHubClient } from './client.js';
import { fetchOrgRepos, fetchUserRepos } from './queries.js';
import type { Repo } from './types.js';

export interface RepoListResult {
	/** The repo list — fresh on success, last-known (or empty) when degraded. */
	repos: Repo[];
	/** True when GitHub could not be reached and we served cached/empty data. */
	stale: boolean;
	/** Human-readable note when degraded, else null. */
	error: string | null;
}

/** Last successful repo list, kept in-process to survive transient GitHub blips. */
let lastKnown: Repo[] | null = null;

/**
 * Fetch the combined user + org repo list, hardened against transient GitHub
 * failures. On success the result is cached; on failure the last-known list (or
 * an empty list) is returned with `stale: true` instead of throwing — so a
 * momentary GitHub hiccup degrades the dashboard rather than 500ing it.
 *
 * Org repos are skipped entirely when no org is configured.
 */
export async function getAllRepos(
	client: GitHubClient,
	owners: { user: string; org: string }
): Promise<RepoListResult> {
	try {
		const fetches = [fetchUserRepos(client, owners.user)];
		if (owners.org) fetches.push(fetchOrgRepos(client, owners.org));

		const lists = await Promise.all(fetches);
		const repos = lists.flat().sort((a, b) => a.full_name.localeCompare(b.full_name));

		lastKnown = repos;
		return { repos, stale: false, error: null };
	} catch (err) {
		const detail = err instanceof Error ? err.message : String(err);
		return {
			repos: lastKnown ?? [],
			stale: true,
			error: `GitHub is temporarily unreachable — showing ${lastKnown ? 'cached' : 'no'} data (${detail})`,
		};
	}
}

/** Test seam: clear the in-process last-known cache. */
export function _resetRepoCache(): void {
	lastKnown = null;
}
