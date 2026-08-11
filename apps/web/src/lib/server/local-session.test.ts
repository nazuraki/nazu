import { describe, it, expect, vi } from 'vitest';

// Config sections backing the session module, mutable per test.
const { sections } = vi.hoisted(() => ({
	sections: {
		oauth: { authSecret: 'test-secret' } as Record<string, unknown>,
		auth: { localUser: 'admin', localPassword: 'scrypt$aa$bb' } as Record<string, unknown>,
	},
}));

vi.mock('$lib/auth.js', () => ({
	localEmail: () => 'local@nazu.local',
}));
vi.mock('$lib/server/settings.js', () => ({
	getSection: async (name: string) => ({ ...sections[name as keyof typeof sections] }),
}));

import {
	signSessionToken,
	verifySessionToken,
	issueLocalSession,
	validateLocalSession,
} from './local-session.js';

describe('session tokens (pure)', () => {
	const key = 'k1';

	it('round-trips a valid token', () => {
		const token = signSessionToken(key, 'admin', 1000);
		expect(verifySessionToken(key, token, 999)).toBe('admin');
	});

	it('rejects an expired token', () => {
		const token = signSessionToken(key, 'admin', 1000);
		expect(verifySessionToken(key, token, 1000)).toBeNull();
	});

	it('rejects a token signed with a different key', () => {
		const token = signSessionToken('other-key', 'admin', 1000);
		expect(verifySessionToken(key, token, 0)).toBeNull();
	});

	it('rejects a tampered payload', () => {
		const token = signSessionToken(key, 'admin', 1000);
		const [, mac] = token.split('.');
		const forged =
			Buffer.from(JSON.stringify({ u: 'root', exp: 9999 })).toString('base64url') + '.' + mac;
		expect(verifySessionToken(key, forged, 0)).toBeNull();
	});

	it('rejects garbage', () => {
		expect(verifySessionToken(key, '', 0)).toBeNull();
		expect(verifySessionToken(key, 'not-a-token', 0)).toBeNull();
		expect(verifySessionToken(key, 'a.b.c', 0)).toBeNull();
	});
});

describe('issue/validate against config', () => {
	it('round-trips through the cookie value', async () => {
		const token = await issueLocalSession('admin');
		expect(token).toBeTruthy();
		const user = await validateLocalSession(token!);
		expect(user).toMatchObject({ id: 'admin', source: 'local' });
	});

	it('invalidates sessions when the password hash changes', async () => {
		const token = await issueLocalSession('admin');
		sections.auth.localPassword = 'scrypt$cc$dd';
		expect(await validateLocalSession(token!)).toBeNull();
		sections.auth.localPassword = 'scrypt$aa$bb';
	});

	it('invalidates sessions when the username changes', async () => {
		const token = await issueLocalSession('admin');
		sections.auth.localUser = 'other';
		expect(await validateLocalSession(token!)).toBeNull();
		sections.auth.localUser = 'admin';
	});

	it('issues nothing when local auth is not configured', async () => {
		sections.auth.localPassword = '';
		expect(await issueLocalSession('admin')).toBeNull();
		sections.auth.localPassword = 'scrypt$aa$bb';
	});
});
