import { describe, expect, it, vi } from 'vitest';

import { checkImages, fetchRemoteDigest, imageRepoKey, parseImageRef } from './updates.js';

const DIGEST_A = 'sha256:' + 'a'.repeat(64);
const DIGEST_B = 'sha256:' + 'b'.repeat(64);

describe('parseImageRef', () => {
	it('parses ghcr refs with tags', () => {
		expect(parseImageRef('ghcr.io/nazuraki/nazu-web:latest')).toEqual({
			registry: 'ghcr.io',
			repo: 'nazuraki/nazu-web',
			tag: 'latest',
		});
	});

	it('defaults registry, library namespace, and tag', () => {
		expect(parseImageRef('postgres')).toEqual({
			registry: 'registry-1.docker.io',
			repo: 'library/postgres',
			tag: 'latest',
		});
		expect(parseImageRef('minio/minio:RELEASE.2026')).toEqual({
			registry: 'registry-1.docker.io',
			repo: 'minio/minio',
			tag: 'RELEASE.2026',
		});
		expect(parseImageRef('localhost:5000/x/y:1')).toEqual({
			registry: 'localhost:5000',
			repo: 'x/y',
			tag: '1',
		});
	});

	it('normalizes repo keys for matching', () => {
		expect(imageRepoKey('ghcr.io/nazuraki/nazu-web:v2')).toBe('ghcr.io/nazuraki/nazu-web');
		expect(imageRepoKey('postgres:18')).toBe('registry-1.docker.io/library/postgres');
	});
});

describe('fetchRemoteDigest', () => {
	it('follows the anonymous token flow on 401', async () => {
		const fetchFn = vi
			.fn()
			.mockResolvedValueOnce(
				new Response(null, {
					status: 401,
					headers: {
						'www-authenticate':
							'Bearer realm="https://ghcr.io/token",service="ghcr.io",scope="repository:nazuraki/nazu-web:pull"',
					},
				}),
			)
			.mockResolvedValueOnce(new Response(JSON.stringify({ token: 'tok123' }), { status: 200 }))
			.mockResolvedValueOnce(
				new Response(null, { status: 200, headers: { 'docker-content-digest': DIGEST_A } }),
			);

		const digest = await fetchRemoteDigest(
			'ghcr.io/nazuraki/nazu-web:latest',
			fetchFn as unknown as typeof fetch,
		);
		expect(digest).toBe(DIGEST_A);

		expect(fetchFn.mock.calls[0][0]).toBe('https://ghcr.io/v2/nazuraki/nazu-web/manifests/latest');
		expect(String(fetchFn.mock.calls[1][0])).toContain('https://ghcr.io/token?service=ghcr.io');
		const retryHeaders = (fetchFn.mock.calls[2][1] as RequestInit).headers as Record<string, string>;
		expect(retryHeaders.Authorization).toBe('Bearer tok123');
	});

	it('sends registry credentials on the token exchange when provided', async () => {
		const fetchFn = vi
			.fn()
			.mockResolvedValueOnce(
				new Response(null, {
					status: 401,
					headers: {
						'www-authenticate':
							'Bearer realm="https://ghcr.io/token",service="ghcr.io",scope="repository:nazuraki/switchboard:pull"',
					},
				}),
			)
			.mockResolvedValueOnce(new Response(JSON.stringify({ token: 'tok456' }), { status: 200 }))
			.mockResolvedValueOnce(
				new Response(null, { status: 200, headers: { 'docker-content-digest': DIGEST_A } }),
			);

		const digest = await fetchRemoteDigest(
			'ghcr.io/nazuraki/switchboard:latest',
			fetchFn as unknown as typeof fetch,
			(registry) => (registry === 'ghcr.io' ? 'Basic abc123' : undefined),
		);
		expect(digest).toBe(DIGEST_A);

		const tokenHeaders = (fetchFn.mock.calls[1][1] as RequestInit | undefined)?.headers as
			| Record<string, string>
			| undefined;
		expect(tokenHeaders?.Authorization).toBe('Basic abc123');
	});

	it('throws on non-ok and missing digest header', async () => {
		const notFound = vi.fn().mockResolvedValue(new Response(null, { status: 404 }));
		await expect(fetchRemoteDigest('ghcr.io/x/y:z', notFound as unknown as typeof fetch)).rejects.toThrow(
			/HTTP 404/,
		);

		const noHeader = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
		await expect(fetchRemoteDigest('ghcr.io/x/y:z', noHeader as unknown as typeof fetch)).rejects.toThrow(
			/no docker-content-digest/,
		);
	});
});

describe('checkImages', () => {
	it('flags updates only when running and remote digests differ', async () => {
		const fetchFn = vi.fn(async (url: string | URL) =>
			String(url).includes('nazu-web')
				? new Response(null, { status: 200, headers: { 'docker-content-digest': DIGEST_B } })
				: new Response(null, { status: 200, headers: { 'docker-content-digest': DIGEST_A } }),
		);
		const running = new Map([
			['ghcr.io/nazuraki/nazu-web', DIGEST_A],
			['ghcr.io/nazuraki/nazu-discord', DIGEST_A],
		]);

		const result = await checkImages(
			['ghcr.io/nazuraki/nazu-web:latest', 'ghcr.io/nazuraki/nazu-discord:latest', 'ghcr.io/x/unknown:1'],
			running,
			fetchFn as unknown as typeof fetch,
		);

		expect(result[0].updateAvailable).toBe(true);
		expect(result[1].updateAvailable).toBe(false);
		// Not running locally → nothing to compare against.
		expect(result[2].updateAvailable).toBe(false);
		expect(result[2].runningDigest).toBeNull();
	});

	it('captures per-image errors without failing the batch', async () => {
		const fetchFn = vi.fn().mockRejectedValue(new Error('network down'));
		const result = await checkImages(['ghcr.io/x/y:1'], new Map(), fetchFn as unknown as typeof fetch);
		expect(result[0].error).toContain('network down');
		expect(result[0].updateAvailable).toBe(false);
	});
});
