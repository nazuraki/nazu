import { describe, expect, it } from 'vitest';

import type { ExecFn, ExecResult } from './exec.js';
import {
	HELPER_NAME,
	SelfUpdateInProgressError,
	SelfUpdateUnavailableError,
	SelfUpdater,
} from './self-update.js';

const SELF_INSPECT = JSON.stringify([
	{
		Config: {
			Image: 'ghcr.io/nazuraki/nazu-backplane:latest',
			Labels: {
				'com.docker.compose.project': 'backplane',
				'com.docker.compose.service': 'backplane',
				'com.docker.compose.project.working_dir': '/home/nazu/nazu-backplane',
				'com.docker.compose.project.config_files': '/home/nazu/nazu-backplane/docker-compose.yml',
			},
		},
		State: { Status: 'running', ExitCode: 0, StartedAt: 't0', FinishedAt: '' },
	},
]);

function helperInspect(status: string, exitCode = 0): string {
	return JSON.stringify([
		{
			Config: { Image: 'x', Labels: {} },
			State: { Status: status, ExitCode: exitCode, StartedAt: 't0', FinishedAt: 't1' },
		},
	]);
}

/** Fake exec: routes docker calls to canned responses, records every call. */
function fakeExec(responses: {
	self?: string;
	helper?: string | Error;
}): { exec: ExecFn; calls: string[][] } {
	const calls: string[][] = [];
	const exec: ExecFn = (cmd, args) => {
		calls.push([cmd, ...args]);
		const ok = (stdout: string): Promise<ExecResult> => Promise.resolve({ stdout, stderr: '' });
		if (args[0] === 'inspect' && args[1] === 'self-id') {
			return responses.self ? ok(responses.self) : Promise.reject(new Error('no such container'));
		}
		if (args[0] === 'inspect' && args[1] === HELPER_NAME) {
			if (responses.helper instanceof Error || responses.helper === undefined) {
				return Promise.reject(responses.helper ?? new Error('no such container'));
			}
			return ok(responses.helper);
		}
		if (args[0] === 'logs') return ok('pulled\n');
		if (args[0] === 'run') return ok('abcdef0123456789\n');
		return ok('');
	};
	return { exec, calls };
}

function makeUpdater(responses: Parameters<typeof fakeExec>[0]): {
	updater: SelfUpdater;
	calls: string[][];
} {
	const { exec, calls } = fakeExec(responses);
	return { updater: new SelfUpdater({ exec, selfId: 'self-id' }), calls };
}

describe('inspect', () => {
	it('reads image and compose project from own labels', async () => {
		const { updater } = makeUpdater({ self: SELF_INSPECT });
		expect(await updater.inspect()).toEqual({
			image: 'ghcr.io/nazuraki/nazu-backplane:latest',
			service: 'backplane',
			composeProject: 'backplane',
			workingDir: '/home/nazu/nazu-backplane',
			configFiles: ['/home/nazu/nazu-backplane/docker-compose.yml'],
		});
	});

	it('is unavailable outside Docker', async () => {
		const { updater } = makeUpdater({});
		await expect(updater.inspect()).rejects.toThrow(SelfUpdateUnavailableError);
	});

	it('is unavailable without compose labels', async () => {
		const { updater } = makeUpdater({
			self: JSON.stringify([
				{ Config: { Image: 'img', Labels: {} }, State: { Status: 'running', ExitCode: 0 } },
			]),
		});
		await expect(updater.inspect()).rejects.toThrow(SelfUpdateUnavailableError);
	});
});

describe('helperStatus', () => {
	it('is null when no helper container exists', async () => {
		const { updater } = makeUpdater({ self: SELF_INSPECT });
		expect(await updater.helperStatus()).toBeNull();
	});

	it('reports an exited helper with exit code and logs', async () => {
		const { updater } = makeUpdater({ self: SELF_INSPECT, helper: helperInspect('exited', 1) });
		const status = await updater.helperStatus();
		expect(status).toMatchObject({ state: 'exited', exitCode: 1, logs: ['pulled'] });
	});

	it('hides exit code while still running', async () => {
		const { updater } = makeUpdater({ self: SELF_INSPECT, helper: helperInspect('running') });
		expect(await updater.helperStatus()).toMatchObject({ state: 'running', exitCode: null });
	});
});

describe('update', () => {
	it('spawns a detached helper wired to the host compose project', async () => {
		const { updater, calls } = makeUpdater({ self: SELF_INSPECT });
		const { helperId } = await updater.update();
		expect(helperId).toBe('abcdef012345');

		const run = calls.find((c) => c[1] === 'run');
		expect(run).toBeDefined();
		expect(run).toContain('-d');
		expect(run).toContain(HELPER_NAME);
		expect(run).toContain('/var/run/docker.sock:/var/run/docker.sock');
		expect(run).toContain('/home/nazu/nazu-backplane:/home/nazu/nazu-backplane:ro');
		expect(run).toContain('ghcr.io/nazuraki/nazu-backplane:latest');
		const script = run![run!.length - 1];
		expect(script).toContain("-p 'backplane'");
		expect(script).toContain("--project-directory '/home/nazu/nazu-backplane'");
		expect(script).toContain("-f '/home/nazu/nazu-backplane/docker-compose.yml'");
		expect(script).toContain("pull 'backplane'");
		expect(script).toContain('up -d');
	});

	it('refuses while a helper is running', async () => {
		const { updater } = makeUpdater({ self: SELF_INSPECT, helper: helperInspect('running') });
		await expect(updater.update()).rejects.toThrow(SelfUpdateInProgressError);
	});

	it('removes a stale exited helper before starting a new one', async () => {
		const { updater, calls } = makeUpdater({ self: SELF_INSPECT, helper: helperInspect('exited') });
		await updater.update();
		expect(calls).toContainEqual(['docker', 'rm', '-f', HELPER_NAME]);
	});
});
