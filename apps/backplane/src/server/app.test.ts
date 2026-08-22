import { describe, expect, it, vi } from 'vitest';

import { createApp, type AppDeps } from './app.js';
import { AuthService } from './lib/auth.js';
import { Deployer } from './lib/deployer.js';
import { Registry } from './lib/registry.js';
import { SelfUpdateInProgressError, SelfUpdateUnavailableError } from './lib/self-update.js';
import { SsoVerifier } from './lib/sso.js';
import type { DeployTarget } from './lib/targets/compose.js';

function makeDeps(overrides: Partial<AppDeps> = {}, apiKey?: string): AppDeps {
	const registry = new Registry(':memory:');
	const target: DeployTarget = {
		deploy: vi.fn(async () => {}),
		update: vi.fn(async () => {}),
		restart: vi.fn(async () => {}),
		status: vi.fn(async () => [
			{ service: 'web', name: 'nazu-web-1', image: 'nazu-web', state: 'running', status: 'Up' },
		]),
	};
	return {
		registry,
		target,
		deployer: new Deployer(registry, target),
		docker: {
			listContainers: vi.fn(async () => []),
			logsTail: vi.fn(async () => ['line1', 'line2']),
			streamLogs: vi.fn(),
		},
		self: {
			inspect: vi.fn(async () => ({
				image: 'ghcr.io/nazuraki/nazu-backplane:latest',
				service: 'backplane',
				composeProject: 'backplane',
				workingDir: '/opt/backplane',
				configFiles: ['/opt/backplane/docker-compose.yml'],
			})),
			helperStatus: vi.fn(async () => null),
			update: vi.fn(async () => ({
				helperId: 'abc123',
				info: {
					image: 'ghcr.io/nazuraki/nazu-backplane:latest',
					service: 'backplane',
					composeProject: 'backplane',
					workingDir: '/opt/backplane',
					configFiles: ['/opt/backplane/docker-compose.yml'],
				},
			})),
		},
		prom: {
			queryRange: vi.fn(async () => ({ status: 200, body: { status: 'success' } })),
			query: vi.fn(async () => ({ status: 200, body: { status: 'success' } })),
		},
		checkProjectUpdates: vi.fn(async () => []),
		auth: new AuthService(apiKey),
		...overrides,
	};
}

const PROJECT = {
	name: 'nazu',
	gitUrl: 'https://github.com/nazuraki/nazu.git',
	branch: 'main',
	images: ['ghcr.io/nazuraki/nazu-web:latest'],
	target: { type: 'compose' },
	autoDeploy: false,
};

describe('auth', () => {
	it('rejects API calls without the key when one is configured', async () => {
		const app = createApp(makeDeps({}, 'sekrit'));
		expect((await app.request('/api/projects')).status).toBe(401);
		expect(
			(await app.request('/api/projects', { headers: { Authorization: 'Bearer wrong' } })).status,
		).toBe(401);
		expect(
			(await app.request('/api/projects', { headers: { Authorization: 'Bearer sekrit' } })).status,
		).toBe(200);
	});

	it('leaves health open and everything open when nothing is configured', async () => {
		const withKey = createApp(makeDeps({}, 'sekrit'));
		expect((await withKey.request('/api/health')).status).toBe(200);

		const open = createApp(makeDeps());
		expect((await open.request('/api/projects')).status).toBe(200);
		const status = (await (await open.request('/api/auth/status')).json()) as Record<string, unknown>;
		expect(status).toMatchObject({ authenticated: true, method: 'open', sso: null, identity: null });
	});

	it('gates the API on the usr SSO cookie and reports identity/refresh in status', async () => {
		const sso = new SsoVerifier({ usrUrl: 'https://usr.example.test', app: 'backplane' });
		const verify = vi.spyOn(sso, 'verify').mockImplementation(async (token) => {
			if (token === 'granted') return { email: 'p@example.test', roles: ['admin'], permissions: [] };
			if (token === 'denied') return { email: 'p@example.test', roles: [], permissions: [] };
			return null;
		});
		const app = createApp(makeDeps({ auth: new AuthService(undefined, sso) }));

		expect((await app.request('/api/projects')).status).toBe(401);
		expect((await app.request('/api/health')).status).toBe(200);
		expect((await app.request('/api/projects', { headers: { cookie: 'nz_id=garbage' } })).status).toBe(401);
		expect((await app.request('/api/projects', { headers: { cookie: 'nz_id=denied' } })).status).toBe(401);
		expect((await app.request('/api/projects', { headers: { cookie: 'nz_id=granted' } })).status).toBe(200);
		expect(verify).toHaveBeenCalled();

		// Status: no cookie → points at usr's refresh with the return URL.
		const anon = (await (
			await app.request('/api/auth/status?return=https%3A%2F%2Fbp.example.test%2F%23%2Fprojects')
		).json()) as { authenticated: boolean; identity: unknown; sso: { refreshUrl: string } };
		expect(anon.authenticated).toBe(false);
		expect(anon.identity).toBeNull();
		expect(anon.sso.refreshUrl).toBe(
			'https://usr.example.test/api/auth/sso/refresh?return=https%3A%2F%2Fbp.example.test%2F%23%2Fprojects',
		);

		// Status: valid cookie without a grant → identity shown, not authenticated.
		const denied = (await (
			await app.request('/api/auth/status', { headers: { cookie: 'nz_id=denied' } })
		).json()) as Record<string, unknown>;
		expect(denied).toMatchObject({
			authenticated: false,
			method: null,
			identity: { email: 'p@example.test', roles: [] },
		});

		const granted = (await (
			await app.request('/api/auth/status', { headers: { cookie: 'nz_id=granted' } })
		).json()) as Record<string, unknown>;
		expect(granted).toMatchObject({
			authenticated: true,
			method: 'sso',
			username: 'p@example.test',
			identity: { roles: ['admin'] },
		});
	});
});

describe('project routes', () => {
	it('creates, fetches, and deletes a project', async () => {
		const app = createApp(makeDeps());

		const created = await app.request('/api/projects', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(PROJECT),
		});
		expect(created.status).toBe(201);

		const got = await app.request('/api/projects/nazu');
		expect(got.status).toBe(200);
		expect(((await got.json()) as { project: { branch: string } }).project.branch).toBe('main');

		expect((await app.request('/api/projects/nazu', { method: 'DELETE' })).status).toBe(200);
		expect((await app.request('/api/projects/nazu')).status).toBe(404);
	});

	it('400s on invalid input and defaults branch to main', async () => {
		const app = createApp(makeDeps());
		const bad = await app.request('/api/projects', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ ...PROJECT, name: 'Bad Name' }),
		});
		expect(bad.status).toBe(400);

		const noBranch = await app.request('/api/projects', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ ...PROJECT, branch: undefined }),
		});
		const body = (await noBranch.json()) as { project: { branch: string } };
		expect(body.project.branch).toBe('main');
	});

	it('deploys via POST and records history', async () => {
		const deps = makeDeps();
		const app = createApp(deps);
		await app.request('/api/projects', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(PROJECT),
		});

		const res = await app.request('/api/projects/nazu/deploy?trigger=webhook', { method: 'POST' });
		expect(res.status).toBe(202);
		const { deploy } = (await res.json()) as { deploy: { id: number; trigger: string } };
		expect(deploy.trigger).toBe('webhook');
		await deps.deployer.settled('nazu');

		const history = await app.request('/api/projects/nazu/deploys');
		const { deploys } = (await history.json()) as { deploys: { status: string }[] };
		expect(deploys).toHaveLength(1);
		expect(deploys[0].status).toBe('succeeded');

		const detail = await app.request(`/api/projects/nazu/deploys/${deploy.id}`);
		expect(detail.status).toBe(200);

		expect((await app.request('/api/projects/nope/deploy', { method: 'POST' })).status).toBe(404);
	});

	it('updates via POST without git-syncing', async () => {
		const deps = makeDeps();
		const app = createApp(deps);
		await app.request('/api/projects', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(PROJECT),
		});

		const res = await app.request('/api/projects/nazu/update', { method: 'POST' });
		expect(res.status).toBe(202);
		const { deploy } = (await res.json()) as { deploy: { action: string } };
		expect(deploy.action).toBe('update');
		await deps.deployer.settled('nazu');

		expect(deps.target.update).toHaveBeenCalledTimes(1);
		expect(deps.target.deploy).not.toHaveBeenCalled();
		expect((await app.request('/api/projects/nope/update', { method: 'POST' })).status).toBe(404);
	});

	it('serves status and updates for known projects', async () => {
		const deps = makeDeps({
			checkProjectUpdates: vi.fn(async () => [
				{
					image: 'ghcr.io/nazuraki/nazu-web:latest',
					remoteDigest: 'sha256:new',
					runningDigest: 'sha256:old',
					updateAvailable: true,
				},
			]),
		});
		const app = createApp(deps);
		await app.request('/api/projects', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(PROJECT),
		});

		const status = await app.request('/api/projects/nazu/status');
		expect(((await status.json()) as { services: unknown[] }).services).toHaveLength(1);

		const updates = await app.request('/api/projects/nazu/updates');
		const body = (await updates.json()) as { updates: { updateAvailable: boolean }[] };
		expect(body.updates[0].updateAvailable).toBe(true);
	});
});

describe('container and metrics routes', () => {
	it('tails container logs as plain text', async () => {
		const app = createApp(makeDeps());
		const res = await app.request('/api/containers/abc123/logs?tail=2');
		expect(res.status).toBe(200);
		expect(await res.text()).toBe('line1\nline2\n');
	});

	it('validates query_range params and proxies prometheus', async () => {
		const deps = makeDeps();
		const app = createApp(deps);

		expect((await app.request('/api/metrics/query_range?query=up')).status).toBe(400);

		const ok = await app.request('/api/metrics/query_range?query=up&start=1&end=2&step=15');
		expect(ok.status).toBe(200);
		expect(deps.prom.queryRange).toHaveBeenCalledWith({
			query: 'up',
			start: '1',
			end: '2',
			step: '15',
		});
	});

	it('502s when prometheus is unreachable', async () => {
		const deps = makeDeps({
			prom: {
				queryRange: vi.fn(async () => {
					throw new Error('ECONNREFUSED');
				}),
				query: vi.fn(async () => {
					throw new Error('ECONNREFUSED');
				}),
			},
		});
		const app = createApp(deps);
		const res = await app.request('/api/metrics/query_range?query=up&start=1&end=2&step=15');
		expect(res.status).toBe(502);
	});
});

describe('self routes', () => {
	it('reports own image update status and helper state', async () => {
		const deps = makeDeps({
			checkProjectUpdates: vi.fn(async (images: string[]) => [
				{ image: images[0], remoteDigest: 'sha256:new', runningDigest: 'sha256:old', updateAvailable: true },
			]),
		});
		const app = createApp(deps);
		const res = await app.request('/api/self');
		expect(res.status).toBe(200);
		const body = (await res.json()) as { self: { updateAvailable: boolean }; helper: null };
		expect(body.self.updateAvailable).toBe(true);
		expect(body.helper).toBeNull();
	});

	it('degrades to self:null when not running under compose', async () => {
		const deps = makeDeps();
		vi.mocked(deps.self.inspect).mockRejectedValue(new SelfUpdateUnavailableError('not in docker'));
		const res = await createApp(deps).request('/api/self');
		expect(res.status).toBe(200);
		expect(((await res.json()) as { self: null }).self).toBeNull();
	});

	it('starts a self-update and 409s while one is running', async () => {
		const deps = makeDeps();
		const app = createApp(deps);

		const started = await app.request('/api/self/update', { method: 'POST' });
		expect(started.status).toBe(202);
		expect(((await started.json()) as { helper: string }).helper).toBe('abc123');

		vi.mocked(deps.self.update).mockRejectedValue(new SelfUpdateInProgressError('busy'));
		expect((await app.request('/api/self/update', { method: 'POST' })).status).toBe(409);
	});
});
