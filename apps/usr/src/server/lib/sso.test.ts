import { describe, expect, it } from 'vitest';

import { buildIdentityClaims, parseTtl, safeReturnUrl, sessionId, ssoConfig, ssoCookieOpts } from './sso.js';

const cfg = { cookieDomain: 'example.internal', ttlSeconds: 1800 };

describe('ssoConfig', () => {
	it('is off without a cookie domain', () => {
		expect(ssoConfig({})).toBeNull();
		expect(ssoConfig({ USR_SSO_COOKIE_DOMAIN: '  ' })).toBeNull();
	});

	it('normalises the domain and parses the ttl with a default', () => {
		expect(ssoConfig({ USR_SSO_COOKIE_DOMAIN: '.Example.Internal' })).toEqual(cfg);
		expect(ssoConfig({ USR_SSO_COOKIE_DOMAIN: 'example.internal', USR_SSO_TOKEN_TTL: '2h' })).toEqual({
			...cfg,
			ttlSeconds: 7200,
		});
		expect(ssoConfig({ USR_SSO_COOKIE_DOMAIN: 'example.internal', USR_SSO_TOKEN_TTL: 'bogus' })).toEqual(cfg);
	});
});

describe('parseTtl', () => {
	it('accepts s/m/h and bare seconds', () => {
		expect(parseTtl('900')).toBe(900);
		expect(parseTtl('900s')).toBe(900);
		expect(parseTtl('15m')).toBe(900);
		expect(parseTtl('1h')).toBe(3600);
		expect(parseTtl('0')).toBeNull();
		expect(parseTtl('-5m')).toBeNull();
		expect(parseTtl(undefined)).toBeNull();
	});
});

describe('buildIdentityClaims', () => {
	it('sets iss/sub/sid/iat/exp/grants', () => {
		const grants = { nazu: { roles: ['editor'], permissions: ['write'] } };
		const c = buildIdentityClaims('a@example.com', 'sid1', grants, 60, 1_000_000_000_000);
		expect(c).toEqual({ iss: 'usr', sub: 'a@example.com', sid: 'sid1', iat: 1_000_000_000, exp: 1_000_000_060, grants });
	});
});

describe('sessionId', () => {
	it('is a stable 16-char digest, not the token', () => {
		expect(sessionId('tok')).toHaveLength(16);
		expect(sessionId('tok')).toBe(sessionId('tok'));
		expect(sessionId('tok')).not.toContain('tok');
	});
});

describe('ssoCookieOpts', () => {
	it('is zone-wide, HttpOnly, Secure, Lax, with ttl maxAge', () => {
		expect(ssoCookieOpts(cfg)).toEqual({
			domain: 'example.internal',
			path: '/',
			httpOnly: true,
			secure: true,
			sameSite: 'Lax',
			maxAge: 1800,
		});
	});
});

describe('safeReturnUrl', () => {
	it('allows the cookie domain and its subdomains', () => {
		expect(safeReturnUrl('https://app.example.internal/x?y=1', cfg)).toBe('https://app.example.internal/x?y=1');
		expect(safeReturnUrl('http://example.internal/', cfg)).toBe('http://example.internal/');
		expect(safeReturnUrl('https://APP.Example.Internal/', cfg)).toBe('https://app.example.internal/');
	});

	it('rejects foreign hosts, lookalikes, odd schemes and credentials', () => {
		expect(safeReturnUrl('https://evil.com/', cfg)).toBeNull();
		expect(safeReturnUrl('https://example.internal.evil.com/', cfg)).toBeNull();
		expect(safeReturnUrl('https://notexample.internal/', cfg)).toBeNull();
		expect(safeReturnUrl('javascript:alert(1)', cfg)).toBeNull();
		expect(safeReturnUrl('//app.example.internal/', cfg)).toBeNull();
		expect(safeReturnUrl('/relative', cfg)).toBeNull();
		expect(safeReturnUrl('https://user:pw@app.example.internal/', cfg)).toBeNull();
		expect(safeReturnUrl(undefined, cfg)).toBeNull();
		expect(safeReturnUrl('', cfg)).toBeNull();
	});
});
