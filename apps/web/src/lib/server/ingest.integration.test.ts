import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

import { chunkDocument } from './chunk';
import { createTestDb, type TestDb } from './test-db';

// Hand the app's getSql() the live PGlite-backed connection (set in beforeAll).
const holder = vi.hoisted(() => ({ sql: undefined as unknown as TestDb['sql'] }));
vi.mock('./db.js', () => ({ getSql: () => holder.sql }));
// Object storage + settings reach $env/dynamic/private and external services —
// stub them so the test stays in-process. No API key ⇒ excerpt generation is skipped.
vi.mock('./storage.js', () => ({
	uploadDocument: vi.fn(async () => {}),
	getDocumentText: vi.fn(async () => '')
}));
vi.mock('./settings.js', () => ({ getSection: vi.fn(async () => ({})) }));

import { storeDocument } from './ingest';
import { search } from './librarian';

let db: TestDb;

beforeAll(async () => {
	db = await createTestDb();
	holder.sql = db.sql;
}, 60_000);

afterAll(async () => {
	await db?.stop();
});

describe('storeDocument (integration)', () => {
	it('persists the document body and a tsvector per chunk', async () => {
		const body = Array.from({ length: 8 }, (_, p) =>
			Array.from({ length: 90 }, (_, i) => `para${p}word${i}`).join(' ')
		).join('\n\n');

		const { document_id } = await storeDocument({
			title: 'Chunking integration doc',
			content: body,
			type: 'note'
		});

		const [doc] = await db.sql<{ has_body: boolean; indexed: boolean }[]>`
			SELECT body_search IS NOT NULL AS has_body, indexed_at IS NOT NULL AS indexed
			FROM documents WHERE id = ${document_id}
		`;
		expect(doc.has_body).toBe(true);
		expect(doc.indexed).toBe(true);

		const chunkRows = await db.sql<
			{ chunk_index: number; word_count: number; has_vec: boolean; content: string }[]
		>`
			SELECT chunk_index, word_count, body_search IS NOT NULL AS has_vec, content
			FROM document_chunks WHERE document_id = ${document_id} ORDER BY chunk_index
		`;

		// One row per chunk the algorithm produced, indices contiguous, all indexed.
		expect(chunkRows).toHaveLength(chunkDocument(body).length);
		expect(chunkRows.length).toBeGreaterThan(1);
		expect(chunkRows.map((r) => r.chunk_index)).toEqual(chunkRows.map((_, i) => i));
		for (const r of chunkRows) {
			expect(r.has_vec).toBe(true);
			expect(r.word_count).toBeGreaterThan(0);
			expect(r.content.length).toBeGreaterThan(0);
		}
	});
});

describe('search (integration)', () => {
	beforeAll(async () => {
		// Title words (zorblax/manual) deliberately absent from the body; the body
		// term (photosynthesis) deliberately absent from the title — so we can tell a
		// body/chunk match from a title-only match.
		await storeDocument({
			title: 'Zorblax Manual',
			content: [
				'An introductory paragraph with plenty of filler words to fill out the section nicely.',
				'Photosynthesis converts sunlight into chemical energy stored in glucose for later use.',
				'A closing paragraph, again with assorted filler so the body spans more than one chunk.'
			].join('\n\n'),
			type: 'reference'
		});
	});

	it('returns a ts_headline passage snippet from the best-matching chunk', async () => {
		const res = await search('photosynthesis', 1, 20);
		const hit = res.entries.find((e) => e.title === 'Zorblax Manual');
		expect(hit).toBeDefined();
		expect(hit?.snippet).toBeTruthy();
		expect(hit?.snippet?.toLowerCase()).toContain('photosynthesis');
	});

	it('leaves snippet undefined for a title-only match (no chunk matched)', async () => {
		const res = await search('zorblax', 1, 20);
		const hit = res.entries.find((e) => e.title === 'Zorblax Manual');
		expect(hit).toBeDefined();
		expect(hit?.snippet).toBeUndefined();
	});
});
