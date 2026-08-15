import { mkdtempSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import type { ExecFn } from '../exec.js';
import type { Project } from '../registry.js';
import { ComposeTarget, parseComposePs } from './compose.js';

function project(overrides: Partial<Project> = {}): Project {
	return {
		name: 'nazu',
		gitUrl: 'https://github.com/nazuraki/nazu.git',
		branch: 'main',
		images: [],
		target: { type: 'compose' },
		autoDeploy: false,
		createdAt: '2026-08-10T00:00:00Z',
		...overrides,
	};
}

function calls(exec: ReturnType<typeof vi.fn>): string[] {
	return exec.mock.calls.map((c) => `${c[0]} ${(c[1] as string[]).join(' ')}`);
}

describe('ComposeTarget', () => {
	it('clones on first deploy, then pulls and ups', async () => {
		const root = mkdtempSync(join(tmpdir(), 'bp-'));
		const exec = vi.fn(async () => ({ stdout: '', stderr: '' })) as unknown as ExecFn;
		const target = new ComposeTarget({ workdirRoot: root, exec });

		await target.deploy(project(), () => {});

		const cmds = calls(exec as ReturnType<typeof vi.fn>);
		expect(cmds[0]).toBe(
			`git clone --branch main --single-branch https://github.com/nazuraki/nazu.git ${join(root, 'nazu')}`,
		);
		expect(cmds[1]).toBe('docker compose -p nazu pull');
		expect(cmds[2]).toBe('docker compose -p nazu up -d --remove-orphans');
	});

	it('fetch+resets an existing checkout and honours target overrides', async () => {
		const root = mkdtempSync(join(tmpdir(), 'bp-'));
		mkdirSync(join(root, 'nazu', '.git'), { recursive: true });
		const exec = vi.fn(async () => ({ stdout: '', stderr: '' })) as unknown as ExecFn;
		const target = new ComposeTarget({ workdirRoot: root, exec });

		const p = project({
			target: {
				type: 'compose',
				projectName: 'nazu-prod',
				composeFiles: ['docker-compose.yml', 'override.yml'],
				profiles: ['tls', 'discord'],
			},
		});
		await target.deploy(p, () => {});

		const cmds = calls(exec as ReturnType<typeof vi.fn>);
		expect(cmds[0]).toBe('git fetch origin main');
		expect(cmds[1]).toBe('git reset --hard origin/main');
		expect(cmds[2]).toBe(
			'docker compose -p nazu-prod -f docker-compose.yml -f override.yml --profile tls --profile discord pull',
		);
	});

	it('update pulls and ups without touching git on an existing checkout', async () => {
		const root = mkdtempSync(join(tmpdir(), 'bp-'));
		mkdirSync(join(root, 'nazu', '.git'), { recursive: true });
		const exec = vi.fn(async () => ({ stdout: '', stderr: '' })) as unknown as ExecFn;
		const target = new ComposeTarget({ workdirRoot: root, exec });

		await target.update(project(), () => {});

		const cmds = calls(exec as ReturnType<typeof vi.fn>);
		expect(cmds).toEqual([
			'docker compose -p nazu pull',
			'docker compose -p nazu up -d --remove-orphans',
		]);
	});

	it('update clones first when there is no checkout yet', async () => {
		const root = mkdtempSync(join(tmpdir(), 'bp-'));
		const exec = vi.fn(async () => ({ stdout: '', stderr: '' })) as unknown as ExecFn;
		const target = new ComposeTarget({ workdirRoot: root, exec });

		await target.update(project(), () => {});

		const cmds = calls(exec as ReturnType<typeof vi.fn>);
		expect(cmds[0]).toBe(
			`git clone --branch main --single-branch https://github.com/nazuraki/nazu.git ${join(root, 'nazu')}`,
		);
		expect(cmds[1]).toBe('docker compose -p nazu pull');
	});

	it('injects git credentials and DOCKER_CONFIG when configured', async () => {
		const root = mkdtempSync(join(tmpdir(), 'bp-'));
		const exec = vi.fn(async () => ({ stdout: '', stderr: '' })) as unknown as ExecFn;
		const target = new ComposeTarget({
			workdirRoot: root,
			exec,
			git: {
				args: ['-c', 'credential.https://github.com.helper=!helper'],
				env: { BACKPLANE_GITHUB_TOKEN: 'tok' },
			},
			dockerEnv: { DOCKER_CONFIG: '/data/docker-config' },
		});

		await target.deploy(project(), () => {});

		const mock = exec as ReturnType<typeof vi.fn>;
		const cmds = calls(mock);
		expect(cmds[0]).toBe(
			`git -c credential.https://github.com.helper=!helper clone --branch main --single-branch https://github.com/nazuraki/nazu.git ${join(root, 'nazu')}`,
		);
		expect((mock.mock.calls[0][2] as { env?: Record<string, string> }).env).toEqual({
			BACKPLANE_GITHUB_TOKEN: 'tok',
		});
		expect((mock.mock.calls[1][2] as { env?: Record<string, string> }).env).toEqual({
			DOCKER_CONFIG: '/data/docker-config',
		});
	});

	it('status returns [] when the project was never synced', async () => {
		const root = mkdtempSync(join(tmpdir(), 'bp-'));
		const exec = vi.fn() as unknown as ExecFn;
		const target = new ComposeTarget({ workdirRoot: root, exec });

		expect(await target.status(project())).toEqual([]);
		expect(exec).not.toHaveBeenCalled();
	});
});

describe('parseComposePs', () => {
	it('parses NDJSON lines', () => {
		const out =
			'{"Service":"web","Name":"nazu-web-1","Image":"nazu-web","State":"running","Status":"Up 2 hours"}\n' +
			'{"Service":"postgres","Name":"nazu-postgres-1","Image":"postgres:18","State":"running","Status":"Up 2 hours"}\n';
		const parsed = parseComposePs(out);
		expect(parsed).toHaveLength(2);
		expect(parsed[0]).toEqual({
			service: 'web',
			name: 'nazu-web-1',
			image: 'nazu-web',
			state: 'running',
			status: 'Up 2 hours',
		});
	});

	it('parses array output and empty output', () => {
		expect(parseComposePs('[{"Service":"web","State":"exited"}]')[0].state).toBe('exited');
		expect(parseComposePs('')).toEqual([]);
	});
});
