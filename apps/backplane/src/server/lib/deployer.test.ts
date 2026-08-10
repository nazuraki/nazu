import { describe, expect, it } from 'vitest';

import { Deployer } from './deployer.js';
import { Registry, type Project } from './registry.js';
import type { DeployTarget, LogFn } from './targets/compose.js';

function project(name = 'nazu'): Project {
	return {
		name,
		gitUrl: 'https://example.com/repo.git',
		branch: 'main',
		images: [],
		target: { type: 'compose' },
		autoDeploy: false,
		createdAt: '2026-08-10T00:00:00Z',
	};
}

describe('Deployer', () => {
	it('records a successful deploy with its log', async () => {
		const registry = new Registry(':memory:');
		const target: DeployTarget = {
			async deploy(_p, log: LogFn) {
				log('pulling');
				log('up');
			},
			async restart() {},
			async status() {
				return [];
			},
		};
		const deployer = new Deployer(registry, target);

		const record = deployer.start(project(), 'deploy', 'manual');
		expect(record.status).toBe('running');
		await deployer.settled('nazu');

		const done = registry.getDeploy(record.id);
		expect(done?.status).toBe('succeeded');
		expect(done?.log).toBe('pulling\nup\n');
	});

	it('marks failures and captures the error in the log', async () => {
		const registry = new Registry(':memory:');
		const target: DeployTarget = {
			async deploy() {
				throw new Error('compose exploded');
			},
			async restart() {},
			async status() {
				return [];
			},
		};
		const deployer = new Deployer(registry, target);

		const record = deployer.start(project(), 'deploy', 'webhook');
		await deployer.settled('nazu');

		const done = registry.getDeploy(record.id);
		expect(done?.status).toBe('failed');
		expect(done?.log).toContain('compose exploded');
	});

	it('serializes runs per project and keeps failures from blocking the queue', async () => {
		const registry = new Registry(':memory:');
		const order: string[] = [];
		const target: DeployTarget = {
			async deploy(_p, log: LogFn) {
				order.push('deploy-start');
				await new Promise((r) => setTimeout(r, 20));
				log('deployed');
				order.push('deploy-end');
				throw new Error('boom');
			},
			async restart() {
				order.push('restart');
			},
			async status() {
				return [];
			},
		};
		const deployer = new Deployer(registry, target);

		const first = deployer.start(project(), 'deploy', 'manual');
		const second = deployer.start(project(), 'restart', 'manual');
		await deployer.settled('nazu');

		expect(order).toEqual(['deploy-start', 'deploy-end', 'restart']);
		expect(registry.getDeploy(first.id)?.status).toBe('failed');
		expect(registry.getDeploy(second.id)?.status).toBe('succeeded');
	});
});
