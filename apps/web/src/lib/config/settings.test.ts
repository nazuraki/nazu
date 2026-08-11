import { describe, it, expect } from 'vitest';
import {
	APP_FEATURES,
	SECTIONS,
	featureForPath,
	getSectionDef,
	isSecretField,
	sectionDefaults,
} from './settings.js';

describe('featureForPath', () => {
	it('matches an exact route', () => {
		expect(featureForPath('/dashboard')?.key).toBe('dashboard');
	});

	it('matches a sub-path of a route', () => {
		expect(featureForPath('/search/results')?.key).toBe('search');
		expect(featureForPath('/api/tasks/42')?.key).toBe('tasks');
	});

	it('matches gated API routes', () => {
		expect(featureForPath('/api/repos')?.key).toBe('dashboard');
		expect(featureForPath('/api/ingest')?.key).toBe('ingest');
	});

	it('does not match a prefix that is not a path segment boundary', () => {
		// '/searchx' must not match the '/search' route.
		expect(featureForPath('/searchx')).toBeUndefined();
	});

	it('returns undefined for ungated paths', () => {
		expect(featureForPath('/settings')).toBeUndefined();
		expect(featureForPath('/api/settings')).toBeUndefined();
		expect(featureForPath('/login')).toBeUndefined();
		expect(featureForPath('/')).toBeUndefined();
	});
});

describe('section schema', () => {
	it('has a features section with one field per app feature', () => {
		const features = getSectionDef('features');
		expect(features?.fields.map((f) => f.key).sort()).toEqual(
			APP_FEATURES.map((f) => f.key).sort(),
		);
		expect(features?.fields.every((f) => f.type === 'boolean')).toBe(true);
	});

	it('marks secret and password fields as secret', () => {
		const github = getSectionDef('github')!;
		const token = github.fields.find((f) => f.key === 'personalToken')!;
		const user = github.fields.find((f) => f.key === 'user')!;
		expect(isSecretField(token)).toBe(true);
		expect(isSecretField(user)).toBe(false);

		const auth = getSectionDef('auth')!;
		expect(isSecretField(auth.fields.find((f) => f.key === 'localPassword')!)).toBe(true);
	});

	it('builds defaults only for fields that declare one', () => {
		const dashboard = getSectionDef('dashboard')!;
		const defaults = sectionDefaults(dashboard);
		expect(defaults.stewardMonthlyBudget).toBe(50);
		expect(defaults.statusWorkflow).toBe('ci.yml');
		expect(defaults.pagesWorkflows).toEqual([]);
		// Fields without a declared default are omitted.
		expect('user' in sectionDefaults(getSectionDef('github')!)).toBe(false);
	});

	it('every section key is unique', () => {
		const keys = SECTIONS.map((s) => s.key);
		expect(new Set(keys).size).toBe(keys.length);
	});
});
