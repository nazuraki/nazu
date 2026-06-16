import { describe, it, expect, vi, beforeEach } from 'vitest';

// Fully stub the ingest helper: keeps the real DB/storage/$env modules out of
// the test and lets us assert the redirect target without a database.
const { storeDocument } = vi.hoisted(() => ({ storeDocument: vi.fn() }));

vi.mock('$lib/server/ingest.js', () => ({
	storeDocument,
	normalizeTags: (t: string | string[] | undefined) =>
		(Array.isArray(t) ? t : String(t ?? '').split(','))
			.map((s) => s.trim().toLowerCase())
			.filter(Boolean)
}));

import { actions } from './+page.server';

const run = actions.default as NonNullable<typeof actions.default>;

function event(fields: Record<string, string>): Parameters<typeof run>[0] {
	const data = new FormData();
	for (const [k, v] of Object.entries(fields)) data.set(k, v);
	const request = new Request('http://localhost/ingest', { method: 'POST', body: data });
	return { request } as unknown as Parameters<typeof run>[0];
}

beforeEach(() => {
	storeDocument.mockReset();
	storeDocument.mockResolvedValue({ id: 'entry-123', title: 'Hello', document_id: 'doc-1' });
});

describe('ingest form action', () => {
	it('stores the document and redirects to the new entry (not the old 404 path)', async () => {
		let thrown: unknown;
		try {
			await run(event({ title: 'Hello', content: 'Body text' }));
		} catch (e) {
			thrown = e;
		}
		expect(storeDocument).toHaveBeenCalledOnce();
		// SvelteKit's redirect() throws a Redirect carrying status + location.
		expect(thrown).toMatchObject({ status: 302, location: '/search/entry/entry-123' });
	});

	it('fails with 400 and does not write when the title is missing', async () => {
		const res = await run(event({ content: 'Body only' }));
		expect(res).toMatchObject({ status: 400 });
		expect(storeDocument).not.toHaveBeenCalled();
	});

	it('fails with 400 when the content is missing', async () => {
		const res = await run(event({ title: 'Title only' }));
		expect(res).toMatchObject({ status: 400 });
		expect(storeDocument).not.toHaveBeenCalled();
	});
});
