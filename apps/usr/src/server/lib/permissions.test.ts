import { describe, expect, it } from 'vitest';

import type { AuthUser } from './auth.js';
import { can, usrPermissions } from './permissions.js';

const rootUser: AuthUser = { id: 'api', email: null, userId: null, root: true, method: 'api-key' };
const emailless: AuthUser = { id: 'local', email: null, userId: null, root: false, method: 'open' };

// DB-backed grant resolution is covered by the compose E2E; these pin the
// pure identity rules: root bypasses, no email means no grants.
describe('can', () => {
	it('root identities pass any check', async () => {
		expect(await can(rootUser, 'users:write')).toBe(true);
		expect(await can(rootUser, 'anything')).toBe(true);
	});

	it('no identity / no email means no grants', async () => {
		expect(await can(null, 'users:read')).toBe(false);
		expect(await can(emailless, 'users:read')).toBe(false);
	});
});

describe('usrPermissions', () => {
	it('root identities hold the admin umbrella', async () => {
		expect(await usrPermissions(rootUser)).toEqual(['admin']);
		expect(await usrPermissions(null)).toEqual([]);
	});
});
