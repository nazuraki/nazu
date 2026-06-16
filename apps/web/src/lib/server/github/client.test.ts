import { afterEach, describe, expect, it, vi } from 'vitest';
import { GitHubClient } from './client';

function jsonResponse(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'Content-Type': 'application/json' },
	});
}

const client = new GitHubClient({ alice: 'token' });

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('GitHubClient.get — timeout + retry', () => {
	it('returns data without retrying when the first call succeeds', async () => {
		const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ ok: 1 }));
		vi.stubGlobal('fetch', fetchMock);

		await expect(client.get('alice', '/x')).resolves.toEqual({ ok: 1 });
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it('retries once on a network error, then succeeds', async () => {
		const fetchMock = vi
			.fn()
			.mockRejectedValueOnce(new TypeError('fetch failed'))
			.mockResolvedValueOnce(jsonResponse({ ok: 1 }));
		vi.stubGlobal('fetch', fetchMock);

		await expect(client.get('alice', '/x')).resolves.toEqual({ ok: 1 });
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});

	it('retries once on a 5xx, then succeeds', async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(jsonResponse({ message: 'boom' }, 503))
			.mockResolvedValueOnce(jsonResponse({ ok: 1 }));
		vi.stubGlobal('fetch', fetchMock);

		await expect(client.get('alice', '/x')).resolves.toEqual({ ok: 1 });
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});

	it('gives up after the retry on a persistent network error', async () => {
		const fetchMock = vi.fn().mockRejectedValue(new TypeError('fetch failed'));
		vi.stubGlobal('fetch', fetchMock);

		await expect(client.get('alice', '/x')).rejects.toThrow('fetch failed');
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});

	it('surfaces a persistent 5xx after exhausting retries', async () => {
		const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ message: 'down' }, 502));
		vi.stubGlobal('fetch', fetchMock);

		await expect(client.get('alice', '/x')).rejects.toThrow('GitHub API 502');
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});

	it('does not retry a 4xx and throws a descriptive error', async () => {
		const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ message: 'Not Found' }, 404));
		vi.stubGlobal('fetch', fetchMock);

		await expect(client.get('alice', '/repos/x')).rejects.toThrow('GitHub API 404');
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});
});
