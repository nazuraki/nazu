import { describe, it, expect, vi } from 'vitest';

// ingest.ts pulls in db/storage/settings, which transitively import
// `$env/dynamic/private` — unavailable in the standalone vitest env. Stub them
// so the pure `normalizeTags` helper can be exercised in isolation.
vi.mock('./db.js', () => ({ getSql: vi.fn() }));
vi.mock('./storage.js', () => ({ uploadDocument: vi.fn() }));
vi.mock('./settings.js', () => ({ getSection: vi.fn() }));

import { normalizeTags } from './ingest';

describe('normalizeTags', () => {
	it('lowercases, trims, and drops blank tags from a comma string', () => {
		expect(normalizeTags(' Foo, BAR , ,baz ')).toEqual(['foo', 'bar', 'baz']);
	});
	it('dedupes case-insensitively', () => {
		expect(normalizeTags('Tag, tag, TAG')).toEqual(['tag']);
	});
	it('accepts an array and normalizes it the same way', () => {
		expect(normalizeTags([' A ', 'b', 'A'])).toEqual(['a', 'b']);
	});
	it('returns [] for undefined or empty input', () => {
		expect(normalizeTags(undefined)).toEqual([]);
		expect(normalizeTags('')).toEqual([]);
	});
});
