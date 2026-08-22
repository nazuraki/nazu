import { Hono } from 'hono';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// In-memory app_settings so the signing key persists without a DB.
const store = new Map<string, Record<string, string>>();
vi.mock('../lib/settings.js', () => ({
	getSection: async (s: string) => ({ ...(store.get(s) ?? {}) }),
	putSection: async (s: string, v: Record<string, string>) => {
		store.set(s, { ...(store.get(s) ?? {}), ...v });
	},
}));
vi.mock('../lib/permissions.js', () => ({
	resolvePermissions: async (email: string) => ({
		email,
		exists: true,
		apps: { nazu: { roles: ['editor'], permissions: ['write'] } },
	}),
	usrPermissions: async () => [],
}));
vi.mock('../lib/auth.js', async (importOriginal) => ({
	...(await importOriginal<typeof import('../lib/auth.js')>()),
	setupRequired: async () => false,
	localAuthConfigured: async () => true,
}));

import type { AppEnv } from '../app.js';
import type { AuthUser } from '../lib/auth.js';
import { _resetSigningKeyCache, jwks, verifyJwt } from '../lib/jwt.js';
import { createPublicKey } from 'node:crypto';
import { authRoutes } from './auth.js';

function build(user: AuthUser | null): Hono<AppEnv> {
	const app = new Hono<AppEnv>();
	app.use('*', async (c, next) => {
		if (user) c.set('user', user);
		await next();
	});
	app.route('/api/auth', authRoutes());
	return app;
}

const sessionUser: AuthUser = {
	id: 'a@example.com',
	email: 'a@example.com',
	userId: 1,
	keyId: null,
	root: false,
	method: 'session',
};

describe('SSO routes', () => {
	beforeEach(() => {
		store.clear();
		_resetSigningKeyCache();
		process.env.USR_SSO_COOKIE_DOMAIN = 'example.internal';
		process.env.USR_SSO_TOKEN_TTL = '10m';
	});
	afterEach(() => {
		delete process.env.USR_SSO_COOKIE_DOMAIN;
		delete process.env.USR_SSO_TOKEN_TTL;
	});

	it('status reports the sso cookie domain only when configured', async () => {
		let res = await build(null).request('/api/auth/status');
		expect(((await res.json()) as { sso: unknown }).sso).toEqual({ cookieDomain: 'example.internal' });
		delete process.env.USR_SSO_COOKIE_DOMAIN;
		res = await build(null).request('/api/auth/status');
		expect(((await res.json()) as { sso: unknown }).sso).toBeNull();
	});

	it('refresh with a live session re-mints nz_id and redirects to the allow-listed return', async () => {
		const res = await build(sessionUser).request(
			'/api/auth/sso/refresh?return=https%3A%2F%2Fapp.example.internal%2Fx',
			{ headers: { cookie: 'usr_session=tok' } },
		);
		expect(res.status).toBe(302);
		expect(res.headers.get('location')).toBe('https://app.example.internal/x');
		const setCookie = res.headers.get('set-cookie') ?? '';
		expect(setCookie).toMatch(/^nz_id=/);
		expect(setCookie).toContain('Domain=example.internal');
		expect(setCookie).toContain('HttpOnly');
		expect(setCookie).toContain('Secure');
		expect(setCookie).toContain('SameSite=Lax');
		expect(setCookie).toContain('Max-Age=600');

		// The cookie is a JWT verifiable against the served JWKS, carrying grants.
		const token = /nz_id=([^;]+)/.exec(setCookie)![1];
		const { keys } = await jwks();
		const claims = verifyJwt(token, keys.map((k) => ({ kid: k.kid, publicKey: createPublicKey({ key: k, format: 'jwk' }) })));
		expect(claims).toMatchObject({
			iss: 'usr',
			sub: 'a@example.com',
			grants: { nazu: { roles: ['editor'], permissions: ['write'] } },
		});
		expect(typeof claims!.sid).toBe('string');
	});

	it('refresh with a foreign return falls back to home', async () => {
		const res = await build(sessionUser).request('/api/auth/sso/refresh?return=https%3A%2F%2Fevil.com%2F', {
			headers: { cookie: 'usr_session=tok' },
		});
		expect(res.headers.get('location')).toBe('/');
	});

	it('refresh without a session redirects to login carrying return', async () => {
		const res = await build(null).request('/api/auth/sso/refresh?return=https%3A%2F%2Fapp.example.internal%2F');
		expect(res.status).toBe(302);
		expect(res.headers.get('location')).toBe('/?return=https%3A%2F%2Fapp.example.internal%2F');
		expect(res.headers.get('set-cookie')).toBeNull();
	});

	it('refresh is 404 when sso is off', async () => {
		delete process.env.USR_SSO_COOKIE_DOMAIN;
		const res = await build(sessionUser).request('/api/auth/sso/refresh');
		expect(res.status).toBe(404);
	});

	it('logout clears nz_id on the cookie domain', async () => {
		const res = await build(sessionUser).request('/api/auth/logout', { method: 'POST' });
		const cookies = res.headers.getSetCookie();
		expect(cookies.some((c) => c.startsWith('usr_session=;'))).toBe(true);
		expect(cookies.some((c) => c.startsWith('nz_id=;') && c.includes('Domain=example.internal'))).toBe(true);
	});

	it('oauth start stores an allow-listed return for the callback', async () => {
		store.set('oauth', { githubId: 'id', githubSecret: 'sec' });
		const res = await build(null).request(
			'/api/auth/oauth/github?return=https%3A%2F%2Fapp.example.internal%2Fy',
		);
		expect(res.status).toBe(302);
		const cookies = res.headers.getSetCookie();
		expect(cookies.some((c) => c.startsWith('usr_oauth_return=https%3A%2F%2Fapp.example.internal%2Fy'))).toBe(true);
	});

	it('jwks serves the current public key', async () => {
		const { keys } = await jwks();
		expect(keys).toHaveLength(1);
		expect(keys[0]).toMatchObject({ kty: 'EC', crv: 'P-256', alg: 'ES256', use: 'sig' });
	});
});
