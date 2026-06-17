import { describe, it, expect, vi } from 'vitest';

import { ingestUrl } from './ingest.js';

function res(body: unknown, status: number): Response {
	return new Response(JSON.stringify(body), { status });
}

describe('ingestUrl', () => {
	it('maps 201 to ingested and sends the URL + poster', async () => {
		const f = vi.fn().mockResolvedValue(res({ status: 'ingested', id: 'e1', title: 'T' }, 201));
		expect(await ingestUrl('https://youtu.be/x', { postedBy: 'bob' }, f)).toEqual({
			status: 'ingested',
			id: 'e1',
			title: 'T',
		});
		const [url, init] = f.mock.calls[0];
		expect(String(url)).toMatch(/\/api\/ingest\/url$/);
		expect(JSON.parse(init.body)).toEqual({ url: 'https://youtu.be/x', postedBy: 'bob' });
	});

	it('maps 200 to duplicate', async () => {
		const f = vi.fn().mockResolvedValue(res({ status: 'duplicate', id: 'old' }, 200));
		expect((await ingestUrl('u', {}, f)).status).toBe('duplicate');
	});

	it('maps 422 unsupported and unavailable distinctly', async () => {
		const unsupported = vi.fn().mockResolvedValue(res({ status: 'unsupported' }, 422));
		expect((await ingestUrl('u', {}, unsupported)).status).toBe('unsupported');

		const unavailable = vi
			.fn()
			.mockResolvedValue(res({ status: 'unavailable', reason: 'no captions' }, 422));
		expect(await ingestUrl('u', {}, unavailable)).toMatchObject({
			status: 'unavailable',
			reason: 'no captions',
		});
	});

	it('maps any other status code to error', async () => {
		expect((await ingestUrl('u', {}, vi.fn().mockResolvedValue(res({}, 503)))).status).toBe('error');
	});

	it('maps a transport failure to error without throwing', async () => {
		const f = vi.fn(async () => {
			throw new Error('ECONNREFUSED');
		});
		expect(await ingestUrl('u', {}, f)).toEqual({ status: 'error', reason: 'ECONNREFUSED' });
	});
});
