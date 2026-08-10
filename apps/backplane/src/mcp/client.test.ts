import { afterEach, describe, expect, it, vi } from 'vitest';

import { api, formatDeploy, formatProjects, formatStatus, formatUpdates } from './client.js';

function mockFetch(bodyByPath: Record<string, unknown>): ReturnType<typeof vi.fn> {
	const fn = vi.fn(async (url: string | URL) => {
		const path = new URL(String(url)).pathname;
		const body = bodyByPath[path];
		if (body === undefined) return new Response('nope', { status: 404 });
		return typeof body === 'string'
			? new Response(body, { status: 200 })
			: Response.json(body);
	});
	vi.stubGlobal('fetch', fn);
	return fn;
}

afterEach(() => vi.unstubAllGlobals());

describe('backplane MCP client', () => {
	it('maps tool calls onto the REST API and formats projects', async () => {
		const fn = mockFetch({
			'/api/projects': {
				projects: [
					{
						name: 'nazu',
						gitUrl: 'https://github.com/nazuraki/nazu.git',
						branch: 'main',
						images: ['ghcr.io/nazuraki/nazu-web:latest'],
						autoDeploy: true,
						target: { type: 'compose', profiles: ['tls'] },
					},
				],
			},
		});

		const text = await formatProjects();
		expect(String(fn.mock.calls[0][0])).toBe('http://localhost:8430/api/projects');
		expect(text).toContain('• nazu — https://github.com/nazuraki/nazu.git (main)');
		expect(text).toContain('profiles=[tls]');
		expect(text).toContain('auto-deploy: on');
	});

	it('formats status, updates, and deploy records', async () => {
		mockFetch({
			'/api/projects/nazu/status': {
				services: [{ service: 'web', state: 'running', status: 'Up 3 days', image: 'nazu-web' }],
			},
			'/api/projects/nazu/updates': {
				updates: [
					{ image: 'ghcr.io/x/a:1', updateAvailable: true },
					{ image: 'ghcr.io/x/b:1', updateAvailable: false, error: 'HTTP 404' },
				],
			},
			'/api/projects/nazu/deploys/7': {
				deploy: {
					id: 7,
					action: 'deploy',
					status: 'succeeded',
					startedAt: 's',
					finishedAt: 'f',
					log: 'pull\nup\n',
				},
			},
		});

		expect(await formatStatus('nazu')).toContain('• web [running] Up 3 days — nazu-web');
		const updates = await formatUpdates('nazu');
		expect(updates).toContain('UPDATE AVAILABLE');
		expect(updates).toContain('check failed (HTTP 404)');
		const deploy = await formatDeploy('nazu', 7);
		expect(deploy).toContain('deploy #7 on nazu: succeeded');
		expect(deploy).toContain('pull\nup');
	});

	it('throws readable errors on non-ok responses and supports text bodies', async () => {
		mockFetch({ '/api/containers/abc/logs': 'line1\nline2\n' });
		expect(await api<string>('/api/containers/abc/logs', 'GET', true)).toBe('line1\nline2\n');
		await expect(api('/api/projects/missing')).rejects.toThrow(/HTTP 404/);
	});
});
