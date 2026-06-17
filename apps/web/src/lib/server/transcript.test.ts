import { describe, it, expect, vi, afterEach } from 'vitest';

// youtube-transcript hits the network; stub it so the fetcher orchestration is
// exercised deterministically. classifyUrl is pure and needs no stub.
const { ytFetch } = vi.hoisted(() => ({ ytFetch: vi.fn() }));
vi.mock('youtube-transcript', () => ({ YoutubeTranscript: { fetchTranscript: ytFetch } }));

import { classifyUrl, fetchTranscript } from './transcript';

const VID = 'dQw4w9WgXcQ'; // valid 11-char id shape

// restoreAllMocks (in afterEach) clears ytFetch + any fetch spy between tests, so
// each test starts clean. We deliberately avoid a beforeEach hook: under vitest
// 4.1.8 a beforeEach makes a synchronous throw from a statically-imported mocked
// ESM module (the "no captions" case below) escape its try/catch — afterEach-only
// does not trip it.
afterEach(() => vi.restoreAllMocks());

/** Stub the oEmbed metadata fetch. */
function stubOEmbed(body: unknown, ok = true) {
	vi.spyOn(globalThis, 'fetch').mockResolvedValue(
		new Response(JSON.stringify(body), { status: ok ? 200 : 404 }),
	);
}

describe('classifyUrl', () => {
	it('recognizes a youtu.be short link and canonicalizes it', () => {
		expect(classifyUrl(`https://youtu.be/${VID}`)).toEqual({
			platform: 'youtube',
			id: VID,
			url: `https://www.youtube.com/watch?v=${VID}`,
		});
	});

	it('recognizes watch URLs and ignores extra params', () => {
		expect(classifyUrl(`https://www.youtube.com/watch?v=${VID}&t=42s&list=abc`)?.id).toBe(VID);
	});

	it('recognizes mobile, music, shorts, embed, and live forms', () => {
		for (const u of [
			`https://m.youtube.com/watch?v=${VID}`,
			`https://music.youtube.com/watch?v=${VID}`,
			`https://www.youtube.com/shorts/${VID}`,
			`https://www.youtube.com/embed/${VID}`,
			`https://www.youtube.com/live/${VID}`,
		]) {
			expect(classifyUrl(u)).toMatchObject({ platform: 'youtube', id: VID });
		}
	});

	it('recognizes a full TikTok post and extracts the numeric id', () => {
		expect(classifyUrl('https://www.tiktok.com/@someone/video/7234567890123456789')).toMatchObject({
			platform: 'tiktok',
			id: '7234567890123456789',
		});
	});

	it('recognizes a TikTok short link by its code', () => {
		expect(classifyUrl('https://vm.tiktok.com/ZMabc123/')).toMatchObject({
			platform: 'tiktok',
			id: 'ZMabc123',
		});
	});

	it('returns null for unrelated, malformed, or non-http URLs', () => {
		expect(classifyUrl('https://example.com/watch?v=abc')).toBeNull();
		expect(classifyUrl('not a url')).toBeNull();
		expect(classifyUrl(`ftp://youtu.be/${VID}`)).toBeNull();
		expect(classifyUrl('https://www.youtube.com/feed/subscriptions')).toBeNull();
		expect(classifyUrl('https://www.tiktok.com/@someone')).toBeNull();
		expect(classifyUrl('https://www.youtube.com/watch?v=tooShort')).toBeNull();
	});
});

describe('fetchTranscript', () => {
	it('returns a transcript with oEmbed title/author for a YouTube link', async () => {
		ytFetch.mockResolvedValue([{ text: 'never gonna' }, { text: 'give you up' }]);
		stubOEmbed({ title: 'Rick Astley - Never Gonna Give You Up', author_name: 'Rick Astley' });

		const out = await fetchTranscript(`https://youtu.be/${VID}`);
		expect(out).toEqual({
			status: 'ok',
			platform: 'youtube',
			title: 'Rick Astley - Never Gonna Give You Up',
			author: 'Rick Astley',
			text: 'never gonna give you up',
			url: `https://www.youtube.com/watch?v=${VID}`,
		});
	});

	it('falls back to a derived title when oEmbed fails', async () => {
		ytFetch.mockResolvedValue([{ text: 'hello world' }]);
		stubOEmbed({}, false);

		const out = await fetchTranscript(`https://www.youtube.com/watch?v=${VID}`);
		expect(out).toMatchObject({ status: 'ok', title: `YouTube video ${VID}`, author: null });
	});

	it('reports unavailable when YouTube has no captions', async () => {
		// Throw synchronously: the spy records a "throw" result rather than storing
		// a rejected promise in mock.results (which vitest would flag as an
		// unhandled rejection). The try/catch in fetchYoutube handles it the same.
		ytFetch.mockImplementation(() => {
			throw new Error('Transcript is disabled');
		});
		const out = await fetchTranscript(`https://youtu.be/${VID}`);
		expect(out).toMatchObject({ status: 'unavailable', platform: 'youtube' });
	});

	it('reports unavailable when the transcript is empty', async () => {
		ytFetch.mockResolvedValue([]);
		const out = await fetchTranscript(`https://youtu.be/${VID}`);
		expect(out).toMatchObject({ status: 'unavailable', platform: 'youtube' });
	});

	it('reports unavailable for TikTok (stub) without hitting the network', async () => {
		ytFetch.mockClear(); // drop call history accrued by earlier YouTube tests
		const spy = vi.spyOn(globalThis, 'fetch');
		const out = await fetchTranscript('https://www.tiktok.com/@x/video/7234567890123456789');
		expect(out).toMatchObject({ status: 'unavailable', platform: 'tiktok' });
		expect(spy).not.toHaveBeenCalled();
		expect(ytFetch).not.toHaveBeenCalled();
	});

	it('reports unsupported for an unrecognized link', async () => {
		expect(await fetchTranscript('https://example.com/page')).toEqual({ status: 'unsupported' });
	});
});
