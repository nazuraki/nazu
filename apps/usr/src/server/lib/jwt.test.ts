import { describe, expect, it } from 'vitest';

import { generateSigningKey, signJwt, toJwk, verifyJwt } from './jwt.js';

const key = generateSigningKey();
const other = generateSigningKey();
const future = Math.floor(Date.now() / 1000) + 60;

describe('signJwt / verifyJwt', () => {
	it('round-trips claims', () => {
		const token = signJwt({ sub: 'a@example.com', exp: future, grants: { nazu: ['x'] } }, key);
		expect(token.split('.')).toHaveLength(3);
		expect(verifyJwt(token, [key])).toMatchObject({ sub: 'a@example.com', grants: { nazu: ['x'] } });
	});

	it('rejects a tampered payload', () => {
		const token = signJwt({ sub: 'a@example.com', exp: future }, key);
		const [h, , s] = token.split('.');
		const p = Buffer.from(JSON.stringify({ sub: 'evil@example.com', exp: future })).toString('base64url');
		expect(verifyJwt(`${h}.${p}.${s}`, [key])).toBeNull();
	});

	it('rejects a token signed by another key or an unknown kid', () => {
		const token = signJwt({ sub: 'a@example.com', exp: future }, other);
		expect(verifyJwt(token, [key])).toBeNull();
		expect(verifyJwt(token, [{ kid: other.kid, publicKey: key.publicKey }])).toBeNull();
	});

	it('enforces exp', () => {
		const token = signJwt({ sub: 'a@example.com', exp: future }, key);
		expect(verifyJwt(token, [key], (future + 1) * 1000)).toBeNull();
		expect(verifyJwt(token, [key], (future - 1) * 1000)).not.toBeNull();
	});

	it('never throws on garbage', () => {
		expect(verifyJwt('', [key])).toBeNull();
		expect(verifyJwt('a.b', [key])).toBeNull();
		expect(verifyJwt('!!.!!.!!', [key])).toBeNull();
		expect(verifyJwt('eyJhbGciOiJub25lIn0.e30.', [key])).toBeNull();
	});
});

describe('toJwk', () => {
	it('exports a P-256 public key with kid/alg/use and no private material', () => {
		const jwk = toJwk(key);
		expect(jwk).toMatchObject({ kty: 'EC', crv: 'P-256', kid: key.kid, alg: 'ES256', use: 'sig' });
		expect(jwk.x).toBeTruthy();
		expect(jwk.y).toBeTruthy();
		expect('d' in jwk).toBe(false);
	});
});
