import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// graphiti.ts imports `$env/dynamic/private` (a SvelteKit virtual module that the
// standalone vitest env can't resolve) and `./settings.js`. Stub both.
vi.mock('$env/dynamic/private', () => ({ env: {} }));

const h = vi.hoisted(() => ({ sections: {} as Record<string, Record<string, unknown>> }));
vi.mock('./settings.js', () => ({
	getSection: vi.fn(async (s: string) => h.sections[s] ?? {}),
}));

import { addEpisode, isGraphEnabled, searchGraph } from './graphiti';

function jsonResponse(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'Content-Type': 'application/json' },
	});
}

function enableGraph() {
	h.sections.graph = {
		enabled: true,
		embedderBaseUrl: 'http://ollama:11434/v1',
		embedderModel: 'nomic-embed-text',
	};
	h.sections.ai = { anthropicApiKey: 'sk-test' };
}

beforeEach(() => {
	h.sections = {};
});

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('isGraphEnabled', () => {
	it('is false when the feature is disabled', async () => {
		h.sections.graph = { enabled: false };
		h.sections.ai = { anthropicApiKey: 'sk-test' };
		expect(await isGraphEnabled()).toBe(false);
	});

	it('is false when enabled but no Anthropic key is configured', async () => {
		h.sections.graph = { enabled: true };
		h.sections.ai = {};
		expect(await isGraphEnabled()).toBe(false);
	});

	it('is true when enabled and a key is present', async () => {
		enableGraph();
		expect(await isGraphEnabled()).toBe(true);
	});
});

describe('addEpisode', () => {
	it('returns null and makes no request when graph is disabled', async () => {
		h.sections.graph = { enabled: false };
		const fetchMock = vi.fn();
		vi.stubGlobal('fetch', fetchMock);

		await expect(
			addEpisode({ documentId: 'd1', name: 'Doc', content: 'body' }),
		).resolves.toBeNull();
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('posts the episode with credential + embedder headers and returns the uuid', async () => {
		enableGraph();
		const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ episode_uuid: 'ep-9' }));
		vi.stubGlobal('fetch', fetchMock);

		const uuid = await addEpisode({ documentId: 'd1', name: 'Doc', content: 'body' });
		expect(uuid).toBe('ep-9');

		const [url, init] = fetchMock.mock.calls[0];
		expect(String(url)).toMatch(/\/episodes$/);
		expect(init.headers['X-Anthropic-Key']).toBe('sk-test');
		expect(init.headers['X-Embedder-Base-Url']).toBe('http://ollama:11434/v1');
		expect(init.headers['X-Embedder-Model']).toBe('nomic-embed-text');
		expect(JSON.parse(init.body)).toMatchObject({ document_id: 'd1', name: 'Doc', content: 'body' });
	});

	it('throws on a non-2xx response from the sidecar', async () => {
		enableGraph();
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ detail: 'boom' }, 500)));
		await expect(
			addEpisode({ documentId: 'd1', name: 'Doc', content: 'body' }),
		).rejects.toThrow(/HTTP 500/);
	});
});

describe('searchGraph', () => {
	it('returns [] and makes no request when graph is disabled', async () => {
		const fetchMock = vi.fn();
		vi.stubGlobal('fetch', fetchMock);
		await expect(searchGraph('q', 10)).resolves.toEqual([]);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('maps sidecar facts and normalizes missing fields', async () => {
		enableGraph();
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue(
				jsonResponse({
					facts: [
						{ fact: 'A relates to B', episode_uuids: ['ep-1', 'ep-2'], score: 0.8 },
						{ fact: 'no episodes', episode_uuids: null, score: null },
					],
				}),
			),
		);

		const facts = await searchGraph('q', 5);
		expect(facts).toEqual([
			{ fact: 'A relates to B', episodeUuids: ['ep-1', 'ep-2'], score: 0.8 },
			{ fact: 'no episodes', episodeUuids: [], score: undefined },
		]);
	});

	it('throws on a non-2xx response from the sidecar', async () => {
		enableGraph();
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({}, 503)));
		await expect(searchGraph('q', 5)).rejects.toThrow(/HTTP 503/);
	});
});
