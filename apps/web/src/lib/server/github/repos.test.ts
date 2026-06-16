import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GitHubClient } from './client';
import { _resetRepoCache, getAllRepos } from './repos';
import type { Repo } from './types';

let nextId = 1;
function repo(full_name: string): Repo {
	const [, name] = full_name.split('/');
	return {
		id: nextId++,
		name,
		full_name,
		description: null,
		private: false,
		archived: false,
		html_url: `https://github.com/${full_name}`,
		pushed_at: null,
		open_issues_count: 0,
		visibility: 'public',
	};
}

/** Fake client exposing only the `paginate` method that the repo queries use. */
function fakeClient(impl: (owner: string, path: string) => Promise<Repo[]>): GitHubClient {
	return { paginate: vi.fn(impl) } as unknown as GitHubClient;
}

afterEach(() => {
	_resetRepoCache();
});

describe('getAllRepos', () => {
	it('returns a sorted, merged user+org list and marks it fresh', async () => {
		const client = fakeClient(async (_owner, path) => {
			if (path === '/user/repos') return [repo('alice/zeta'), repo('alice/alpha')];
			if (path === '/orgs/acme/repos') return [repo('acme/mid')];
			return [];
		});

		const res = await getAllRepos(client, { user: 'alice', org: 'acme' });

		expect(res.stale).toBe(false);
		expect(res.error).toBeNull();
		expect(res.repos.map((r) => r.full_name)).toEqual(['acme/mid', 'alice/alpha', 'alice/zeta']);
	});

	it('skips the org fetch entirely when no org is configured', async () => {
		const paginate = vi.fn(async (_owner: string, path: string) => {
			if (path === '/user/repos') return [repo('alice/a')];
			throw new Error('org should not be fetched');
		});
		const client = { paginate } as unknown as GitHubClient;

		const res = await getAllRepos(client, { user: 'alice', org: '' });

		expect(res.stale).toBe(false);
		expect(res.repos).toHaveLength(1);
		expect(paginate).toHaveBeenCalledTimes(1);
	});

	it('returns an empty list flagged stale on failure with no prior cache', async () => {
		const client = fakeClient(async () => {
			throw new TypeError('fetch failed');
		});

		const res = await getAllRepos(client, { user: 'alice', org: '' });

		expect(res.repos).toEqual([]);
		expect(res.stale).toBe(true);
		expect(res.error).toContain('no data');
	});

	it('serves the last-known list flagged stale after a prior success then failure', async () => {
		const good = fakeClient(async () => [repo('alice/a')]);
		await getAllRepos(good, { user: 'alice', org: '' });

		const bad = fakeClient(async () => {
			throw new TypeError('fetch failed');
		});
		const res = await getAllRepos(bad, { user: 'alice', org: '' });

		expect(res.repos.map((r) => r.full_name)).toEqual(['alice/a']);
		expect(res.stale).toBe(true);
		expect(res.error).toContain('cached');
	});
});
