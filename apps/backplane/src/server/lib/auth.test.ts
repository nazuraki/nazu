import { describe, expect, it, vi } from 'vitest';

import { AuthService } from './auth.js';
import { SsoVerifier } from './sso.js';

/** An SsoVerifier whose verify() is stubbed — the real one is covered in sso.test.ts. */
function fakeSso(result: { email: string; roles: string[]; permissions: string[] } | null): SsoVerifier {
	const sso = new SsoVerifier({ usrUrl: 'https://usr.example.test', app: 'backplane' });
	vi.spyOn(sso, 'verify').mockResolvedValue(result);
	return sso;
}

describe('AuthService', () => {
	it('is open when nothing is configured, gated once either method is', async () => {
		const open = new AuthService();
		expect(open.required()).toBe(false);
		expect(await open.authenticate(undefined, undefined)).toMatchObject({ method: 'open' });

		expect(new AuthService('key').required()).toBe(true);
		expect(new AuthService(undefined, fakeSso(null)).required()).toBe(true);
		expect(await new AuthService('key').authenticate(undefined, undefined)).toBeNull();
	});

	it('accepts the bearer key exactly and rejects near-misses', async () => {
		const auth = new AuthService('key123');
		expect(await auth.authenticate('Bearer key123', undefined)).toMatchObject({ method: 'api-key' });
		expect(await auth.authenticate('Bearer key12', undefined)).toBeNull();
		expect(await auth.authenticate('Bearer key1234', undefined)).toBeNull();
		expect(await auth.authenticate('key123', undefined)).toBeNull();
		expect(await auth.authenticate(`Basic ${Buffer.from('a:b').toString('base64')}`, undefined)).toBeNull();
	});

	it('accepts an SSO identity with a backplane grant, rejects one without', async () => {
		const granted = new AuthService(
			undefined,
			fakeSso({ email: 'p@example.test', roles: ['admin'], permissions: [] }),
		);
		expect(await granted.authenticate(undefined, 'tok')).toMatchObject({
			method: 'sso',
			username: 'p@example.test',
			identity: { roles: ['admin'] },
		});

		const denied = new AuthService(undefined, fakeSso({ email: 'p@example.test', roles: [], permissions: [] }));
		expect(await denied.authenticate(undefined, 'tok')).toBeNull();

		const invalid = new AuthService(undefined, fakeSso(null));
		expect(await invalid.authenticate(undefined, 'tok')).toBeNull();
		// No cookie at all never consults the verifier.
		const untouched = new AuthService(undefined, fakeSso(null));
		expect(await untouched.authenticate(undefined, undefined)).toBeNull();
		expect(untouched.sso!.verify).not.toHaveBeenCalled();
	});

	it('lets the bearer key bypass SSO when both are configured', async () => {
		const auth = new AuthService('key', fakeSso(null));
		expect(await auth.authenticate('Bearer key', undefined)).toMatchObject({ method: 'api-key' });
		expect(await auth.authenticate(undefined, 'tok')).toBeNull();
	});
});
