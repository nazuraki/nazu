import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { AuthService, hashPassword, verifyPassword } from './auth.js';
import { Registry } from './registry.js';

describe('password hashing', () => {
	it('verifies a correct password and rejects wrong/garbage input', () => {
		const stored = hashPassword('s3cret-pass');
		expect(stored.startsWith('scrypt$')).toBe(true);
		expect(verifyPassword('s3cret-pass', stored)).toBe(true);
		expect(verifyPassword('wrong', stored)).toBe(false);
		expect(verifyPassword('s3cret-pass', 'not-a-hash')).toBe(false);
		expect(verifyPassword('s3cret-pass', 'md5$aa$bb')).toBe(false);
	});

	it('salts: same password hashes differently', () => {
		expect(hashPassword('x')).not.toBe(hashPassword('x'));
	});
});

describe('AuthService', () => {
	it('is open when nothing is configured, gated once credentials exist', () => {
		const auth = new AuthService(new Registry(':memory:'));
		expect(auth.required()).toBe(false);
		expect(auth.authenticate(undefined, undefined)).toMatchObject({ method: 'open' });

		auth.setAccount('admin', 'pw12345678');
		expect(auth.required()).toBe(true);
		expect(auth.authenticate(undefined, undefined)).toBeNull();

		auth.clearAccount();
		expect(auth.authenticate(undefined, undefined)).toMatchObject({ method: 'open' });
	});

	it('resolves the ladder: bearer, session, basic', () => {
		const auth = new AuthService(new Registry(':memory:'), 'key123');
		auth.setAccount('admin', 'pw12345678');

		expect(auth.authenticate('Bearer key123', undefined)).toMatchObject({ method: 'api-key' });
		expect(auth.authenticate('Bearer nope', undefined)).toBeNull();

		const { token } = auth.createSession('admin');
		expect(auth.authenticate(undefined, token)).toMatchObject({
			method: 'session',
			username: 'admin',
		});
		expect(auth.authenticate(undefined, 'forged-token')).toBeNull();

		const basic = `Basic ${Buffer.from('admin:pw12345678').toString('base64')}`;
		expect(auth.authenticate(basic, undefined)).toMatchObject({ method: 'basic' });
		expect(
			auth.authenticate(`Basic ${Buffer.from('admin:wrong').toString('base64')}`, undefined),
		).toBeNull();
	});

	it('revokes sessions on logout and on credential change', () => {
		const auth = new AuthService(new Registry(':memory:'));
		auth.setAccount('admin', 'pw12345678');

		const { token } = auth.createSession('admin');
		expect(auth.validateSessionToken(token)).toBe('admin');

		auth.revokeSession(token);
		expect(auth.validateSessionToken(token)).toBeNull();

		const { token: token2 } = auth.createSession('admin');
		auth.setAccount('admin', 'new-password-99');
		expect(auth.validateSessionToken(token2)).toBeNull();
	});

	it('expires sessions past their TTL', () => {
		const registry = new Registry(':memory:');
		const auth = new AuthService(registry);
		auth.setAccount('admin', 'pw12345678');
		const { token } = auth.createSession('admin');

		// Backdate the stored expiry rather than waiting 30 days.
		registry.deleteAllSessions();
		registry.insertSession(
			createHash('sha256').update(token).digest('hex'),
			'admin',
			new Date(Date.now() - 1000).toISOString(),
		);
		expect(auth.validateSessionToken(token)).toBeNull();
	});
});
