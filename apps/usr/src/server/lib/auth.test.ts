import { describe, expect, it } from 'vitest';

import { hashPassword, hashToken, validateApiKey, validateBasicHeader, verifyPassword } from './auth.js';

describe('password hashing', () => {
	it('round-trips', () => {
		const stored = hashPassword('hunter2');
		expect(stored.startsWith('scrypt$')).toBe(true);
		expect(verifyPassword('hunter2', stored)).toBe(true);
		expect(verifyPassword('hunter3', stored)).toBe(false);
	});

	it('rejects malformed stored values', () => {
		expect(verifyPassword('x', 'plaintext')).toBe(false);
		expect(verifyPassword('x', 'scrypt$$')).toBe(false);
	});
});

describe('validateApiKey', () => {
	it('accepts only an exact match when configured', () => {
		expect(validateApiKey('secret', 'secret')?.method).toBe('api-key');
		expect(validateApiKey('secret', 'secret')?.root).toBe(true);
		expect(validateApiKey('wrong', 'secret')).toBeNull();
		expect(validateApiKey(undefined, 'secret')).toBeNull();
	});

	it('is disabled when no key is configured', () => {
		expect(validateApiKey('anything', '')).toBeNull();
	});
});

describe('validateBasicHeader', () => {
	it('parses user:pass', () => {
		const header = `Basic ${Buffer.from('admin:pw:with:colons').toString('base64')}`;
		expect(validateBasicHeader(header)).toEqual(['admin', 'pw:with:colons']);
	});

	it('rejects non-basic and malformed headers', () => {
		expect(validateBasicHeader(undefined)).toBeNull();
		expect(validateBasicHeader('Bearer abc')).toBeNull();
		expect(validateBasicHeader(`Basic ${Buffer.from('no-colon').toString('base64')}`)).toBeNull();
	});
});

describe('hashToken', () => {
	it('is deterministic and never the input', () => {
		expect(hashToken('tok')).toBe(hashToken('tok'));
		expect(hashToken('tok')).not.toBe('tok');
	});
});
