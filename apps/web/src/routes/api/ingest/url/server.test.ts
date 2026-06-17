import { describe, it, expect, vi, beforeEach } from 'vitest';

// Stub the transcript fetch + ingest helpers so the route logic (branching on
// outcome, dedup, response shape) is tested without network/DB/$env.
const { fetchTranscript, storeDocument, findEntryBySourceUrl } = vi.hoisted(() => ({
	fetchTranscript: vi.fn(),
	storeDocument: vi.fn(),
	findEntryBySourceUrl: vi.fn(),
}));

vi.mock('$lib/server/transcript.js', () => ({ fetchTranscript }));
vi.mock('$lib/server/ingest.js', () => ({
	storeDocument,
	findEntryBySourceUrl,
	normalizeTags: (t: string | string[] | undefined) =>
		[
			...new Set(
				(Array.isArray(t) ? t : String(t ?? '').split(','))
					.map((s) => s.trim().toLowerCase())
					.filter(Boolean),
			),
		],
}));

import { POST } from './+server';

function post(body: unknown): Parameters<typeof POST>[0] {
	const request = new Request('http://localhost/api/ingest/url', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: typeof body === 'string' ? body : JSON.stringify(body),
	});
	return { request } as unknown as Parameters<typeof POST>[0];
}

const OK_OUTCOME = {
	status: 'ok' as const,
	platform: 'youtube' as const,
	title: 'A Video',
	author: 'A Channel',
	text: 'the transcript',
	url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
};

beforeEach(() => {
	fetchTranscript.mockReset();
	storeDocument.mockReset();
	findEntryBySourceUrl.mockReset();
	findEntryBySourceUrl.mockResolvedValue(null);
	storeDocument.mockResolvedValue({ id: 'entry-1', title: 'A Video', document_id: 'doc-1' });
});

describe('POST /api/ingest/url', () => {
	it('ingests a fresh transcript and tags it with discord + platform', async () => {
		fetchTranscript.mockResolvedValue(OK_OUTCOME);

		const res = await POST(post({ url: 'https://youtu.be/dQw4w9WgXcQ', tags: 'Music' }));
		expect(res.status).toBe(201);
		expect(await res.json()).toEqual({ status: 'ingested', id: 'entry-1', title: 'A Video' });

		expect(storeDocument).toHaveBeenCalledOnce();
		const arg = storeDocument.mock.calls[0][0];
		expect(arg).toMatchObject({
			title: 'A Video',
			content: 'the transcript',
			type: 'transcript',
			author: 'A Channel',
			source_url: OK_OUTCOME.url,
		});
		expect(arg.tags).toEqual(expect.arrayContaining(['music', 'discord', 'youtube']));
	});

	it('returns 200 duplicate and does not re-store a known source_url', async () => {
		fetchTranscript.mockResolvedValue(OK_OUTCOME);
		findEntryBySourceUrl.mockResolvedValue({ id: 'old-1', title: 'A Video' });

		const res = await POST(post({ url: 'https://youtu.be/dQw4w9WgXcQ' }));
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ status: 'duplicate', id: 'old-1', title: 'A Video' });
		expect(storeDocument).not.toHaveBeenCalled();
	});

	it('returns 422 for an unsupported link', async () => {
		fetchTranscript.mockResolvedValue({ status: 'unsupported' });
		const res = await POST(post({ url: 'https://example.com' }));
		expect(res.status).toBe(422);
		expect((await res.json()).status).toBe('unsupported');
		expect(storeDocument).not.toHaveBeenCalled();
	});

	it('returns 422 with the reason when no transcript is available', async () => {
		fetchTranscript.mockResolvedValue({
			status: 'unavailable',
			platform: 'tiktok',
			reason: 'not implemented',
		});
		const res = await POST(post({ url: 'https://www.tiktok.com/@x/video/7234567890123456789' }));
		expect(res.status).toBe(422);
		expect(await res.json()).toMatchObject({ status: 'unavailable', platform: 'tiktok' });
	});

	it('rejects a missing url with 400', async () => {
		await expect(POST(post({}))).rejects.toMatchObject({ status: 400 });
		expect(fetchTranscript).not.toHaveBeenCalled();
	});

	it('rejects invalid JSON with 400', async () => {
		await expect(POST(post('not-json'))).rejects.toMatchObject({ status: 400 });
	});
});
