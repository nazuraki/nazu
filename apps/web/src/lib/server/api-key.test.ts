import { describe, it, expect } from 'vitest';
import { validateApiKey, extractApiKey, parseApiKeys } from './api-key';

function req(headers: Record<string, string> = {}): Request {
	return new Request('http://localhost/api/remember', { headers });
}

describe('parseApiKeys', () => {
	it('splits comma-separated and trims/filters blanks', () => {
		expect(parseApiKeys(' a, b ,,c ')).toEqual(['a', 'b', 'c']);
	});
	it('returns [] for undefined or empty', () => {
		expect(parseApiKeys(undefined)).toEqual([]);
		expect(parseApiKeys('')).toEqual([]);
	});
});

describe('extractApiKey', () => {
	it('reads a Bearer token', () => {
		expect(extractApiKey(req({ Authorization: 'Bearer secret123' }))).toBe('secret123');
	});
	it('reads an X-API-Key header', () => {
		expect(extractApiKey(req({ 'X-API-Key': 'secret123' }))).toBe('secret123');
	});
	it('returns null when no key header is present', () => {
		expect(extractApiKey(req())).toBeNull();
	});
});

describe('validateApiKey', () => {
	const keys = ['right-key', 'second-key'];

	it('accepts a correct Bearer key and stamps the agent identity', () => {
		expect(validateApiKey(req({ Authorization: 'Bearer right-key' }), keys)).toMatchObject({
			id: 'agent',
			source: 'api-key'
		});
	});
	it('accepts a correct X-API-Key', () => {
		expect(validateApiKey(req({ 'X-API-Key': 'second-key' }), keys)?.source).toBe('api-key');
	});
	it('rejects a wrong key', () => {
		expect(validateApiKey(req({ Authorization: 'Bearer nope' }), keys)).toBeNull();
	});
	it('rejects when no key is presented', () => {
		expect(validateApiKey(req(), keys)).toBeNull();
	});
	it('is disabled (null) when no keys are configured', () => {
		expect(validateApiKey(req({ Authorization: 'Bearer right-key' }), [])).toBeNull();
	});
});
