import { createSign, generateKeyPairSync, type KeyObject } from 'node:crypto';

type TestJwk = Record<string, unknown> & { kid: string };

import { describe, expect, it, vi } from 'vitest';

import { ssoConfig, SsoVerifier, type SsoConfig } from './sso.js';

/** Mirror of usr's signer (apps/usr/src/server/lib/jwt.ts) — ES256 compact JWS. */
function makeKey(kid = 'k1'): { kid: string; privateKey: KeyObject; jwk: TestJwk } {
	const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
	return { kid, privateKey, jwk: { ...publicKey.export({ format: 'jwk' }), kid, alg: 'ES256', use: 'sig' } };
}

function sign(claims: Record<string, unknown>, key: { kid: string; privateKey: KeyObject }): string {
	const b64 = (v: unknown): string => Buffer.from(JSON.stringify(v)).toString('base64url');
	const header = b64({ alg: 'ES256', typ: 'JWT', kid: key.kid });
	const payload = b64(claims);
	const signer = createSign('SHA256');
	signer.update(`${header}.${payload}`);
	const sig = signer.sign({ key: key.privateKey, dsaEncoding: 'ieee-p1363' });
	return `${header}.${payload}.${sig.toString('base64url')}`;
}

const CFG: SsoConfig = { usrUrl: 'https://usr.example.test', app: 'backplane' };
const NOW = 1_800_000_000_000;

function claims(overrides: Record<string, unknown> = {}): Record<string, unknown> {
	const iat = Math.floor(NOW / 1000);
	return {
		iss: 'usr',
		sub: 'person@example.test',
		sid: 'abc',
		iat,
		exp: iat + 1800,
		grants: { backplane: { roles: ['admin'], permissions: ['deploy'] } },
		...overrides,
	};
}

function jwksFetch(keys: TestJwk[]): ReturnType<typeof vi.fn> {
	return vi.fn(async () => new Response(JSON.stringify({ keys }), { status: 200 }));
}

describe('ssoConfig', () => {
	it('is off without BACKPLANE_USR_URL, trims trailing slashes, defaults the app', () => {
		expect(ssoConfig({})).toBeNull();
		expect(ssoConfig({ BACKPLANE_USR_URL: 'https://usr.example.test/' })).toEqual({
			usrUrl: 'https://usr.example.test',
			app: 'backplane',
		});
		expect(ssoConfig({ BACKPLANE_USR_URL: 'https://u', BACKPLANE_USR_APP: 'bp' })?.app).toBe('bp');
	});
});

describe('SsoVerifier', () => {
	it('verifies a good token and extracts the app grants', async () => {
		const key = makeKey();
		const fetchImpl = jwksFetch([key.jwk]);
		const sso = new SsoVerifier(CFG, fetchImpl as unknown as typeof fetch, () => NOW);

		const id = await sso.verify(sign(claims(), key));
		expect(id).toEqual({ email: 'person@example.test', roles: ['admin'], permissions: ['deploy'] });
		expect(sso.authorized(id!)).toBe(true);
		expect(fetchImpl).toHaveBeenCalledWith('https://usr.example.test/.well-known/jwks.json');

		// Second verify within the cache window does not refetch.
		await sso.verify(sign(claims(), key));
		expect(fetchImpl).toHaveBeenCalledTimes(1);
	});

	it('reports no-access identities (absent app key) as unauthorized but known', async () => {
		const key = makeKey();
		const sso = new SsoVerifier(CFG, jwksFetch([key.jwk]) as unknown as typeof fetch, () => NOW);
		const id = await sso.verify(sign(claims({ grants: { nazu: { roles: ['editor'], permissions: [] } } }), key));
		expect(id).toEqual({ email: 'person@example.test', roles: [], permissions: [] });
		expect(sso.authorized(id!)).toBe(false);
	});

	it('rejects expired, wrong-issuer, wrong-alg, tampered and malformed tokens', async () => {
		const key = makeKey();
		const sso = new SsoVerifier(CFG, jwksFetch([key.jwk]) as unknown as typeof fetch, () => NOW);

		expect(await sso.verify(undefined)).toBeNull();
		expect(await sso.verify('nope')).toBeNull();
		expect(await sso.verify('a.b.c')).toBeNull();
		expect(await sso.verify(sign(claims({ exp: Math.floor(NOW / 1000) - 1 }), key))).toBeNull();
		expect(await sso.verify(sign(claims({ iss: 'other' }), key))).toBeNull();

		const good = sign(claims(), key);
		const [h, p, s] = good.split('.');
		const forgedPayload = Buffer.from(JSON.stringify(claims({ sub: 'evil@example.test' }))).toString(
			'base64url',
		);
		expect(await sso.verify(`${h}.${forgedPayload}.${s}`)).toBeNull();
		const hs256 = Buffer.from(JSON.stringify({ alg: 'HS256', kid: 'k1' })).toString('base64url');
		expect(await sso.verify(`${hs256}.${p}.${s}`)).toBeNull();

		// Signed by a key usr does not publish.
		const rogue = makeKey('k1');
		expect(await sso.verify(sign(claims(), rogue))).toBeNull();
	});

	it('refetches the JWKS on an unknown kid (key rotation) and survives fetch failures', async () => {
		const k1 = makeKey('k1');
		const k2 = makeKey('k2');
		let published = [k1.jwk];
		const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ keys: published }), { status: 200 }));
		const sso = new SsoVerifier(CFG, fetchImpl as unknown as typeof fetch, () => NOW);

		expect(await sso.verify(sign(claims(), k1))).not.toBeNull();
		expect(await sso.verify(sign(claims(), k2))).toBeNull();
		expect(fetchImpl).toHaveBeenCalledTimes(2);

		published = [k1.jwk, k2.jwk];
		expect(await sso.verify(sign(claims(), k2))).not.toBeNull();

		const down = new SsoVerifier(
			CFG,
			vi.fn(async () => {
				throw new Error('ECONNREFUSED');
			}) as unknown as typeof fetch,
			() => NOW,
		);
		expect(await down.verify(sign(claims(), k1))).toBeNull();
	});

	it('builds the usr refresh URL with the return target encoded', () => {
		const sso = new SsoVerifier(CFG, jwksFetch([]) as unknown as typeof fetch);
		expect(sso.refreshUrl('https://bp.example.test/#/projects?x=1')).toBe(
			'https://usr.example.test/api/auth/sso/refresh?return=https%3A%2F%2Fbp.example.test%2F%23%2Fprojects%3Fx%3D1',
		);
	});
});
