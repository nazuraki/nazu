import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { createTestDb, type TestDb } from './test-db';

// Real graphiti.ts + ingest.ts + librarian.ts run against PGlite; only the
// sidecar (fetch), object storage, the Anthropic SDK, and settings are stubbed.
vi.mock('$env/dynamic/private', () => ({ env: {} }));

const holder = vi.hoisted(() => ({ sql: undefined as unknown as TestDb['sql'] }));
vi.mock('./db.js', () => ({ getSql: () => holder.sql }));
vi.mock('./storage.js', () => ({
	uploadDocument: vi.fn(async () => {}),
	getDocumentText: vi.fn(async () => ''),
}));
// Graph recall enabled, with a key — so graphConfig() resolves and the real
// client runs against the mocked sidecar below.
vi.mock('./settings.js', () => ({
	getSection: vi.fn(async (s: string) => {
		if (s === 'graph')
			return { enabled: true, embedderBaseUrl: 'http://ollama:11434/v1', embedderModel: 'nomic-embed-text' };
		if (s === 'ai') return { anthropicApiKey: 'sk-test' };
		return {};
	}),
}));
// Excerpt generation would otherwise hit the real Anthropic API (a key is set).
vi.mock('@anthropic-ai/sdk', () => ({
	default: class {
		messages = { create: vi.fn(async () => ({ content: [{ type: 'text', text: 'excerpt' }] })) };
	},
}));

import { storeDocument } from './ingest';
import { search } from './librarian';

let db: TestDb;

// Sidecar emulation state, reset per test.
let episodeCounter = 0;
let failEpisodes = false;
let searchFacts: { fact: string; episode_uuids: string[]; score: number | null }[] = [];

function jsonResponse(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

beforeAll(async () => {
	db = await createTestDb();
	holder.sql = db.sql;
}, 60_000);

afterAll(async () => {
	await db?.stop();
});

beforeEach(async () => {
	await db.sql`TRUNCATE documents CASCADE`;
	episodeCounter = 0;
	failEpisodes = false;
	searchFacts = [];
	vi.stubGlobal(
		'fetch',
		vi.fn(async (url: string | URL) => {
			const u = String(url);
			if (u.endsWith('/episodes')) {
				if (failEpisodes) return jsonResponse({ detail: 'boom' }, 500);
				return jsonResponse({ episode_uuid: `ep-${++episodeCounter}` });
			}
			if (u.endsWith('/search')) return jsonResponse({ facts: searchFacts });
			throw new Error(`unexpected fetch: ${u}`);
		}),
	);
});

afterEach(() => {
	vi.unstubAllGlobals();
});

async function episodeUuidFor(documentId: string): Promise<string | undefined> {
	const [row] = await db.sql<{ episode_uuid: string }[]>`
		SELECT episode_uuid FROM graph_episodes WHERE document_id = ${documentId}
	`;
	return row?.episode_uuid;
}

describe('write path → graph_episodes', () => {
	it('records the episode uuid returned by the sidecar', async () => {
		const { document_id } = await storeDocument({
			title: 'Quantum Entanglement',
			content: 'Spooky action at a distance links the states of two particles.',
		});
		expect(await episodeUuidFor(document_id)).toBe('ep-1');
	});

	it('is non-fatal when the sidecar errors — the write still succeeds', async () => {
		failEpisodes = true;
		const { id, document_id } = await storeDocument({
			title: 'Resilient Note',
			content: 'This document must persist even if graph indexing fails.',
		});
		// kb entry exists, no graph mapping was written.
		const [kb] = await db.sql<{ id: string }[]>`SELECT id FROM kb_index WHERE id = ${id}`;
		expect(kb.id).toBe(id);
		expect(await episodeUuidFor(document_id)).toBeUndefined();
	});
});

describe('recall augmentation', () => {
	it('surfaces a graph-only hit FTS missed (paraphrase), marked recall_source=graph', async () => {
		const { id, document_id } = await storeDocument({
			title: 'Quantum Entanglement',
			content: 'Spooky action at a distance links the states of two particles.',
		});
		const epUuid = await episodeUuidFor(document_id);
		searchFacts = [{ fact: 'entanglement enables instantaneous correlation', episode_uuids: [epUuid!], score: 0.9 }];

		// Query shares no lexemes with the title/body, so FTS alone returns nothing.
		const res = await search('renewable power sources', 1, 20);
		const hit = res.entries.find((e) => e.id === id);
		expect(hit).toBeDefined();
		expect(hit?.recall_source).toBe('graph');
		expect(res.total).toBe(1);
	});

	it('does not duplicate a document already returned by FTS', async () => {
		const { id, document_id } = await storeDocument({
			title: 'Photosynthesis Overview',
			content: 'Photosynthesis converts sunlight into chemical energy stored as glucose.',
		});
		const epUuid = await episodeUuidFor(document_id);
		// Graph also returns the same document — it must not appear twice.
		searchFacts = [{ fact: 'photosynthesis stores energy', episode_uuids: [epUuid!], score: 0.9 }];

		const res = await search('photosynthesis', 1, 20);
		const hits = res.entries.filter((e) => e.id === id);
		expect(hits).toHaveLength(1);
		expect(hits[0].recall_source).toBe('fts');
	});

	it('returns FTS results unchanged when the graph has nothing to add', async () => {
		await storeDocument({
			title: 'Photosynthesis Overview',
			content: 'Photosynthesis converts sunlight into chemical energy stored as glucose.',
		});
		searchFacts = [];
		const res = await search('photosynthesis', 1, 20);
		expect(res.entries.every((e) => e.recall_source === 'fts')).toBe(true);
		expect(res.total).toBe(1);
	});
});
