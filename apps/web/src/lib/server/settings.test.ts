import { describe, it, expect, beforeEach, vi } from 'vitest';

// In-memory backing store, swapped in for the DB persistence layer.
const { store } = vi.hoisted(() => ({ store: new Map<string, Record<string, unknown>>() }));

vi.mock('./settings-store.js', () => ({
	readRaw: async (section: string) => structuredClone(store.get(section) ?? {}),
	writeRaw: async (section: string, config: Record<string, unknown>) => {
		store.set(section, structuredClone(config));
	},
}));

import {
	getSection,
	setSection,
	listSettings,
	isFeatureEnabled,
	featureStates,
	requireFeature,
	hashPassword,
	verifyPassword,
	__clearSettingsCache,
} from './settings.js';

beforeEach(() => {
	store.clear();
	__clearSettingsCache();
});

describe('getSection', () => {
	it('returns schema defaults when nothing is stored', async () => {
		const d = await getSection('dashboard');
		expect(d.stewardMonthlyBudget).toBe(50);
		expect(d.dockerContainers).toEqual([]);
	});

	it('overlays stored values on defaults', async () => {
		await setSection('dashboard', { statusWorkflow: 'ci.yml' });
		const d = await getSection('dashboard');
		expect(d.statusWorkflow).toBe('ci.yml');
		expect(d.stewardMonthlyBudget).toBe(50); // default preserved
	});

	it('auto-generates a stable auth secret for the oauth section', async () => {
		const first = (await getSection('oauth')).authSecret;
		expect(typeof first).toBe('string');
		expect((first as string).length).toBeGreaterThan(0);
		__clearSettingsCache();
		const second = (await getSection('oauth')).authSecret;
		expect(second).toBe(first); // persisted, not regenerated
	});
});

describe('setSection validation', () => {
	it('rejects an unknown section', async () => {
		await expect(setSection('nope', {})).rejects.toMatchObject({ status: 400 });
	});

	it('rejects an unknown field', async () => {
		await expect(setSection('github', { bogus: 'x' })).rejects.toMatchObject({ status: 400 });
	});

	it('rejects a wrong-typed boolean', async () => {
		await expect(setSection('features', { dashboard: 'yes' })).rejects.toMatchObject({
			status: 400,
		});
	});

	it('rejects a non-numeric number', async () => {
		await expect(
			setSection('dashboard', { stewardMonthlyBudget: 'lots' }),
		).rejects.toMatchObject({ status: 400 });
	});

	it('rejects a non-string list', async () => {
		await expect(setSection('dashboard', { dockerContainers: 'web' })).rejects.toMatchObject({
			status: 400,
		});
		await expect(setSection('dashboard', { dockerContainers: [1, 2] })).rejects.toMatchObject({
			status: 400,
		});
	});

	it('accepts a valid list', async () => {
		await setSection('dashboard', { dockerContainers: ['web', 'postgres'] });
		expect((await getSection('dashboard')).dockerContainers).toEqual(['web', 'postgres']);
	});
});

describe('secret and password handling', () => {
	it('leaves a secret unchanged when submitted blank', async () => {
		await setSection('github', { personalToken: 'tok-1' });
		await setSection('github', { personalToken: '' });
		expect((await getSection('github')).personalToken).toBe('tok-1');
	});

	it('stores passwords hashed, not in plaintext', async () => {
		await setSection('auth', { localPassword: 'hunter2' });
		const stored = (await getSection('auth')).localPassword as string;
		expect(stored).not.toBe('hunter2');
		expect(stored.startsWith('scrypt$')).toBe(true);
		expect(verifyPassword('hunter2', stored)).toBe(true);
		expect(verifyPassword('wrong', stored)).toBe(false);
	});
});

describe('listSettings', () => {
	it('masks secret values and reports which are set', async () => {
		await setSection('github', { user: 'me', personalToken: 'tok' });
		const sections = await listSettings();
		const github = sections.find((s) => s.key === 'github')!;
		expect(github.values.user).toBe('me');
		expect(github.values.personalToken).toBe('');
		expect(github.secretSet.personalToken).toBe(true);
		expect(github.secretSet.orgToken).toBe(false);
	});

	it('excludes the features section (rendered as toggles)', async () => {
		const sections = await listSettings();
		expect(sections.find((s) => s.key === 'features')).toBeUndefined();
	});
});

describe('feature gating', () => {
	it('defaults features to enabled', async () => {
		expect(await isFeatureEnabled('search')).toBe(true);
	});

	it('reflects a disabled feature', async () => {
		await setSection('features', { search: false });
		expect(await isFeatureEnabled('search')).toBe(false);
		const states = await featureStates();
		expect(states.find((f) => f.key === 'search')?.enabled).toBe(false);
	});

	it('requireFeature throws 404 when disabled, passes when enabled', async () => {
		await setSection('features', { tasks: false });
		await expect(requireFeature('tasks')).rejects.toMatchObject({ status: 404 });
		await expect(requireFeature('ingest')).resolves.toBeUndefined();
	});
});

describe('hashPassword / verifyPassword', () => {
	it('round-trips and rejects wrong input', () => {
		const h = hashPassword('s3cret');
		expect(verifyPassword('s3cret', h)).toBe(true);
		expect(verifyPassword('nope', h)).toBe(false);
	});

	it('returns false for malformed stored values', () => {
		expect(verifyPassword('x', 'garbage')).toBe(false);
		expect(verifyPassword('x', '')).toBe(false);
	});

	it('uses a random salt (distinct hashes for same input)', () => {
		expect(hashPassword('same')).not.toBe(hashPassword('same'));
	});
});
