import { describe, it, expect } from 'vitest';

import { extractWatchableLinks } from './links.js';

describe('extractWatchableLinks', () => {
	it('returns [] when there are no links', () => {
		expect(extractWatchableLinks('just some text, nothing to see')).toEqual([]);
	});

	it('extracts a single YouTube link from surrounding prose', () => {
		expect(extractWatchableLinks('watch this https://youtu.be/dQw4w9WgXcQ now')).toEqual([
			'https://youtu.be/dQw4w9WgXcQ',
		]);
	});

	it('extracts multiple links across watched hosts in order', () => {
		expect(
			extractWatchableLinks(
				'a https://www.youtube.com/watch?v=abc and b https://www.tiktok.com/@u/video/123',
			),
		).toEqual(['https://www.youtube.com/watch?v=abc', 'https://www.tiktok.com/@u/video/123']);
	});

	it('ignores non-watched hosts', () => {
		expect(extractWatchableLinks('https://example.com and https://github.com/x/y')).toEqual([]);
	});

	it('strips trailing punctuation and Discord angle brackets', () => {
		expect(extractWatchableLinks('see (https://youtu.be/abc123DEFGH).')).toEqual([
			'https://youtu.be/abc123DEFGH',
		]);
		expect(extractWatchableLinks('<https://youtu.be/xyz789LMNOP>')).toEqual([
			'https://youtu.be/xyz789LMNOP',
		]);
	});

	it('de-duplicates a link posted twice in one message', () => {
		expect(extractWatchableLinks('https://youtu.be/dup and again https://youtu.be/dup')).toEqual([
			'https://youtu.be/dup',
		]);
	});
});
