import { describe, it, expect, vi, beforeEach } from 'vitest';

// assistant.ts pulls in settings/librarian (which transitively import
// `$env/dynamic/private`, DB, storage) and the Anthropic SDK. Stub all three so
// the orchestration + pure helpers run in isolation without network/DB/$env.
const { getSection, search, streamMock } = vi.hoisted(() => ({
	getSection: vi.fn(),
	search: vi.fn(),
	streamMock: vi.fn(),
}));

vi.mock('./settings.js', () => ({ getSection }));
vi.mock('./librarian.js', () => ({ search }));
vi.mock('@anthropic-ai/sdk', () => ({
	default: class {
		messages = { stream: streamMock };
	},
}));

import {
	answerQuestion,
	AssistantConfigError,
	buildContextBlock,
	buildSystemPrompt,
	toSources,
} from './assistant';
import type { ChatEvent } from '$lib/nazu/types';
import type { Entry } from '$lib/search/types';

function entry(over: Partial<Entry> = {}): Entry {
	return {
		id: 'id-1',
		title: 'Title One',
		excerpt: 'an excerpt',
		type: 'note',
		tags: [],
		author: '',
		created_at: '',
		updated_at: '',
		ref_count: 0,
		word_count: 0,
		read_time: 0,
		...over,
	};
}

/** Async-iterable Anthropic stream of text deltas. */
function fakeStream(texts: string[]) {
	return (async function* () {
		for (const text of texts) {
			yield { type: 'content_block_delta', delta: { type: 'text_delta', text } };
		}
		// A non-text event the orchestration must ignore.
		yield { type: 'message_stop' };
	})();
}

async function collect(messages: { role: 'user' | 'assistant'; content: string }[]): Promise<ChatEvent[]> {
	const out: ChatEvent[] = [];
	for await (const ev of answerQuestion(messages)) out.push(ev);
	return out;
}

describe('buildSystemPrompt', () => {
	it('instructs grounding, numbered citation, and admitting ignorance', () => {
		const p = buildSystemPrompt().toLowerCase();
		expect(p).toContain('only');
		expect(p).toContain('cite');
		expect(p).toContain('[1]');
		expect(p).toMatch(/do not guess|say so/);
	});
});

describe('toSources', () => {
	it('assigns 1-based citation numbers and keeps id/title/type', () => {
		expect(toSources([entry({ id: 'a', title: 'A' }), entry({ id: 'b', title: 'B', type: 'doc' })])).toEqual([
			{ n: 1, id: 'a', title: 'A', type: 'note' },
			{ n: 2, id: 'b', title: 'B', type: 'doc' },
		]);
	});
});

describe('buildContextBlock', () => {
	it('returns a sentinel when there is nothing to cite', () => {
		expect(buildContextBlock([])).toMatch(/no relevant entries/i);
	});

	it('numbers each source and prefers the chunk snippet over the excerpt', () => {
		const block = buildContextBlock([
			entry({ title: 'First', type: 'note', snippet: 'best passage', excerpt: 'the summary' }),
			entry({ title: 'Second', type: 'doc', snippet: undefined, excerpt: 'fallback summary' }),
		]);
		expect(block).toContain('[1] First (note)');
		expect(block).toContain('best passage');
		expect(block).not.toContain('the summary');
		expect(block).toContain('[2] Second (doc)');
		expect(block).toContain('fallback summary');
	});
});

describe('answerQuestion', () => {
	beforeEach(() => {
		getSection.mockReset();
		search.mockReset();
		streamMock.mockReset();
		getSection.mockResolvedValue({ anthropicApiKey: 'sk-test', chatModel: 'claude-test' });
		search.mockResolvedValue({ entries: [entry({ id: 'x', title: 'X' })] });
		streamMock.mockReturnValue(fakeStream(['Hello ', 'world [1]']));
	});

	it('emits sources first, then a delta per text chunk', async () => {
		const events = await collect([{ role: 'user', content: 'what is x?' }]);
		expect(events[0]).toEqual({ type: 'sources', sources: [{ n: 1, id: 'x', title: 'X', type: 'note' }] });
		expect(events.slice(1)).toEqual([
			{ type: 'delta', text: 'Hello ' },
			{ type: 'delta', text: 'world [1]' },
		]);
	});

	it('retrieves on the latest user turn and passes the context + model to Claude', async () => {
		await collect([
			{ role: 'user', content: 'earlier' },
			{ role: 'assistant', content: 'prior answer' },
			{ role: 'user', content: 'what is x?' },
		]);

		expect(search).toHaveBeenCalledWith('what is x?', 1, 6);
		const params = streamMock.mock.calls[0][0];
		expect(params.model).toBe('claude-test');
		// Prior turns are carried; the final user turn pairs context with the question.
		const last = params.messages[params.messages.length - 1];
		expect(last.role).toBe('user');
		expect(last.content).toContain('[1] X (note)');
		expect(last.content).toContain('Question: what is x?');
		expect(params.messages[0]).toEqual({ role: 'user', content: 'earlier' });
	});

	it('falls back to the default model when none is configured', async () => {
		getSection.mockResolvedValue({ anthropicApiKey: 'sk-test' });
		await collect([{ role: 'user', content: 'q' }]);
		expect(streamMock.mock.calls[0][0].model).toBe('claude-sonnet-4-6');
	});

	it('still answers (empty sources, no search) when the question is blank', async () => {
		const events = await collect([{ role: 'user', content: '   ' }]);
		expect(events[0]).toEqual({ type: 'sources', sources: [] });
		expect(search).not.toHaveBeenCalled();
		expect(streamMock.mock.calls[0][0].messages.at(-1).content).toMatch(/no relevant entries/i);
	});

	it('throws AssistantConfigError when no Anthropic key is configured', async () => {
		getSection.mockResolvedValue({ anthropicApiKey: '' });
		const gen = answerQuestion([{ role: 'user', content: 'q' }]);
		await expect(gen.next()).rejects.toBeInstanceOf(AssistantConfigError);
		expect(search).not.toHaveBeenCalled();
	});
});
