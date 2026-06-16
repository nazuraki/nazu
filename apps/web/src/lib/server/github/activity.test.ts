import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import type { GitHubClient } from './client';
import { buildActivity } from './activity';
import { fetchOpenIssues, fetchOpenPRs, fetchRecentRuns } from './queries.js';
import type { Repo } from './types';

vi.mock('$lib/server/repoconfig.js', () => ({
	getStatusWorkflow: vi.fn(async () => null),
	getPagesWorkflow: vi.fn(async () => null),
}));

vi.mock('./queries.js', () => ({
	fetchOpenIssues: vi.fn(),
	fetchOpenPRs: vi.fn(),
	fetchRecentRuns: vi.fn(),
}));

function repo(full_name: string): Repo {
	return { full_name } as Repo;
}

const client = {} as GitHubClient;

beforeEach(() => {
	vi.resetAllMocks();
});

describe('buildActivity', () => {
	it('returns activity per repo and is not degraded when every call succeeds', async () => {
		(fetchOpenIssues as Mock).mockResolvedValue([{ id: 1 }]);
		(fetchOpenPRs as Mock).mockResolvedValue([]);
		(fetchRecentRuns as Mock).mockResolvedValue([]);

		const res = await buildActivity(client, [repo('alice/a'), repo('alice/b')]);

		expect(res.degraded).toBe(false);
		expect(res.activity).toHaveLength(2);
		expect(res.activity[0].issues).toHaveLength(1);
		expect(res.activity[0].latestRun).toBeNull();
	});

	it('degrades that card to empty data (no throw) when a per-repo fetch fails', async () => {
		(fetchOpenPRs as Mock).mockResolvedValue([]);
		(fetchRecentRuns as Mock).mockResolvedValue([]);
		(fetchOpenIssues as Mock).mockImplementation(async (_c: unknown, _owner: string, name: string) => {
			if (name === 'b') throw new TypeError('fetch failed');
			return [{ id: 1 }];
		});

		const res = await buildActivity(client, [repo('alice/a'), repo('alice/b')]);

		expect(res.degraded).toBe(true);
		const a = res.activity.find((x) => x.full_name === 'alice/a');
		const b = res.activity.find((x) => x.full_name === 'alice/b');
		expect(a?.issues).toHaveLength(1);
		expect(b?.issues).toEqual([]);
	});
});
