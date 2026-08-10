import { describe, expect, it } from 'vitest';

import { Registry, ValidationError, type ProjectInput } from './registry.js';

function project(overrides: Partial<ProjectInput> = {}): ProjectInput {
	return {
		name: 'nazu',
		gitUrl: 'https://github.com/nazuraki/nazu.git',
		branch: 'main',
		images: ['ghcr.io/nazuraki/nazu-web:latest'],
		target: { type: 'compose', profiles: ['tls'] },
		autoDeploy: false,
		...overrides,
	};
}

describe('Registry projects', () => {
	it('saves, lists, gets, and deletes projects', () => {
		const r = new Registry(':memory:');
		r.saveProject(project());
		r.saveProject(project({ name: 'other', gitUrl: 'https://example.com/o.git' }));

		expect(r.listProjects().map((p) => p.name)).toEqual(['nazu', 'other']);
		expect(r.getProject('nazu')?.target).toEqual({ type: 'compose', profiles: ['tls'] });
		expect(r.deleteProject('other')).toBe(true);
		expect(r.deleteProject('other')).toBe(false);
		expect(r.getProject('other')).toBeUndefined();
	});

	it('upserts in place and preserves createdAt', () => {
		const r = new Registry(':memory:');
		const first = r.saveProject(project());
		const updated = r.saveProject(project({ branch: 'develop', autoDeploy: true }));

		expect(updated.createdAt).toBe(first.createdAt);
		const got = r.getProject('nazu');
		expect(got?.branch).toBe('develop');
		expect(got?.autoDeploy).toBe(true);
		expect(r.listProjects()).toHaveLength(1);
	});

	it('rejects bad names, missing fields, and unknown target types', () => {
		const r = new Registry(':memory:');
		expect(() => r.saveProject(project({ name: 'Bad Name!' }))).toThrow(ValidationError);
		expect(() => r.saveProject(project({ gitUrl: ' ' }))).toThrow(ValidationError);
		expect(() => r.saveProject(project({ branch: '' }))).toThrow(ValidationError);
		expect(() =>
			r.saveProject(project({ target: { type: 'aws' } as unknown as ProjectInput['target'] })),
		).toThrow(/unsupported deploy target/);
	});
});

describe('Registry deploys', () => {
	it('records deploy lifecycle with appended logs', () => {
		const r = new Registry(':memory:');
		const d = r.createDeploy('nazu', 'deploy', 'manual');
		expect(d.status).toBe('running');

		r.appendDeployLog(d.id, 'pulling');
		r.appendDeployLog(d.id, 'done');
		r.finishDeploy(d.id, 'succeeded');

		const got = r.getDeploy(d.id);
		expect(got?.status).toBe('succeeded');
		expect(got?.log).toBe('pulling\ndone\n');
		expect(got?.finishedAt).toBeTruthy();
	});

	it('lists deploys newest-first with a limit', () => {
		const r = new Registry(':memory:');
		for (let i = 0; i < 5; i++) r.createDeploy('nazu', 'deploy', 'poll');
		r.createDeploy('other', 'restart', 'manual');

		const list = r.listDeploys('nazu', 3);
		expect(list).toHaveLength(3);
		expect(list[0].id).toBeGreaterThan(list[2].id);
		expect(list.every((d) => d.project === 'nazu')).toBe(true);
	});
});
