/**
 * Minimal ES256 JWT signer/verifier + JWKS — node:crypto only, no deps.
 * The signing keypair is generated on first use and persisted in the
 * `app_settings` section `jwt` (PEM private key + kid), cached in memory.
 * Pure helpers take an explicit key so they are unit-testable without a DB.
 */
import {
	createPrivateKey,
	createPublicKey,
	createSign,
	createVerify,
	generateKeyPairSync,
	randomBytes,
	type KeyObject,
} from 'node:crypto';

import { getSection, putSection } from './settings.js';

export interface SigningKey {
	kid: string;
	privateKey: KeyObject;
	publicKey: KeyObject;
}

export interface Jwk {
	kty: string;
	crv: string;
	x: string;
	y: string;
	kid: string;
	alg: 'ES256';
	use: 'sig';
}

export type Claims = Record<string, unknown> & { exp?: number; iat?: number };

const ALG = 'ES256';

const b64url = (input: Buffer | string): string =>
	Buffer.from(input).toString('base64url');

/** Generate a fresh P-256 keypair with a random kid. */
export function generateSigningKey(): SigningKey {
	const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
	return { kid: randomBytes(8).toString('hex'), privateKey, publicKey };
}

/** Sign claims as a compact ES256 JWS. */
export function signJwt(claims: Claims, key: SigningKey): string {
	const header = b64url(JSON.stringify({ alg: ALG, typ: 'JWT', kid: key.kid }));
	const payload = b64url(JSON.stringify(claims));
	const signer = createSign('SHA256');
	signer.update(`${header}.${payload}`);
	const sig = signer.sign({ key: key.privateKey, dsaEncoding: 'ieee-p1363' });
	return `${header}.${payload}.${b64url(sig)}`;
}

/**
 * Verify signature + exp against the given public keys (by kid). Returns the
 * claims or null — never throws on malformed input.
 */
export function verifyJwt(
	token: string,
	keys: Pick<SigningKey, 'kid' | 'publicKey'>[],
	now: number = Date.now(),
): Claims | null {
	const parts = token.split('.');
	if (parts.length !== 3) return null;
	const [h, p, s] = parts;
	let header: { alg?: string; kid?: string };
	let claims: Claims;
	try {
		header = JSON.parse(Buffer.from(h, 'base64url').toString());
		claims = JSON.parse(Buffer.from(p, 'base64url').toString());
	} catch {
		return null;
	}
	if (header.alg !== ALG) return null;
	const key = keys.find((k) => k.kid === header.kid);
	if (!key) return null;
	const verifier = createVerify('SHA256');
	verifier.update(`${h}.${p}`);
	let ok = false;
	try {
		ok = verifier.verify(
			{ key: key.publicKey, dsaEncoding: 'ieee-p1363' },
			Buffer.from(s, 'base64url'),
		);
	} catch {
		return null;
	}
	if (!ok) return null;
	if (typeof claims.exp === 'number' && claims.exp * 1000 <= now) return null;
	return claims;
}

/** Public JWK for a key, as served from /.well-known/jwks.json. */
export function toJwk(key: Pick<SigningKey, 'kid' | 'publicKey'>): Jwk {
	const jwk = key.publicKey.export({ format: 'jwk' }) as { kty: string; crv: string; x: string; y: string };
	return { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y, kid: key.kid, alg: ALG, use: 'sig' };
}

// ── Persisted signing key ──────────────────────────────────────────────────────

let cached: SigningKey | null = null;

/** The app's signing key: loaded from app_settings, generated + stored on first use. */
export async function getSigningKey(): Promise<SigningKey> {
	if (cached) return cached;
	const s = await getSection('jwt');
	if (s.privateKey && s.kid) {
		const privateKey = createPrivateKey(s.privateKey);
		cached = { kid: s.kid, privateKey, publicKey: createPublicKey(privateKey) };
		return cached;
	}
	const key = generateSigningKey();
	await putSection('jwt', {
		kid: key.kid,
		privateKey: key.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
	});
	cached = key;
	return key;
}

/** JWKS document: the current key (rotation = more entries later). */
export async function jwks(): Promise<{ keys: Jwk[] }> {
	return { keys: [toJwk(await getSigningKey())] };
}

/** Test hook. */
export function _resetSigningKeyCache(): void {
	cached = null;
}
