import { describe, it, expect, vi } from 'vitest';

vi.mock('$env/dynamic/private', () => ({ env: {} }));
vi.mock('$lib/server/settings.js', () => ({
	getSection: async () => ({}),
	verifyPassword: () => false,
}));

import { oauthViableHost } from './auth.js';

describe('oauthViableHost', () => {
	it('accepts localhost and loopback', () => {
		expect(oauthViableHost('localhost')).toBe(true);
		expect(oauthViableHost('127.0.0.1')).toBe(true);
		expect(oauthViableHost('::1')).toBe(true);
	});

	it('accepts real domains', () => {
		expect(oauthViableHost('nazu.example.com')).toBe(true);
		expect(oauthViableHost('example.dev')).toBe(true);
	});

	it('rejects single-label LAN hostnames', () => {
		expect(oauthViableHost('myserver')).toBe(false);
	});

	it('rejects bare IPv4 addresses', () => {
		expect(oauthViableHost('192.168.1.50')).toBe(false);
		expect(oauthViableHost('10.0.0.2')).toBe(false);
	});
});
