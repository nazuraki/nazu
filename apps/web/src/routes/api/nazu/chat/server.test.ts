import { describe, it, expect, vi, beforeEach } from 'vitest';

// Stub the assistant so the route's validation, config gate, and SSE framing are
// tested without the Anthropic SDK / DB / $env.
const { isChatConfigured, answerQuestion, FakeConfigError } = vi.hoisted(() => ({
	isChatConfigured: vi.fn(),
	answerQuestion: vi.fn(),
	FakeConfigError: class extends Error {},
}));

vi.mock('$lib/server/assistant.js', () => ({
	isChatConfigured,
	answerQuestion,
	AssistantConfigError: FakeConfigError,
}));

import { POST } from './+server';

function post(body: unknown): Parameters<typeof POST>[0] {
	const request = new Request('http://localhost/api/nazu/chat', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: typeof body === 'string' ? body : JSON.stringify(body),
	});
	return { request } as unknown as Parameters<typeof POST>[0];
}

const USER_MSG = [{ role: 'user', content: 'hello?' }];

beforeEach(() => {
	isChatConfigured.mockReset();
	answerQuestion.mockReset();
	isChatConfigured.mockResolvedValue(true);
});

describe('POST /api/nazu/chat — validation', () => {
	it('rejects invalid JSON with 400', async () => {
		await expect(POST(post('not-json'))).rejects.toMatchObject({ status: 400 });
	});

	it('rejects a missing/empty message list with 400', async () => {
		await expect(POST(post({}))).rejects.toMatchObject({ status: 400 });
		await expect(POST(post({ messages: [] }))).rejects.toMatchObject({ status: 400 });
	});

	it('rejects a malformed message shape with 400', async () => {
		await expect(POST(post({ messages: [{ role: 'system', content: 'x' }] }))).rejects.toMatchObject({
			status: 400,
		});
		await expect(POST(post({ messages: [{ role: 'user', content: 42 }] }))).rejects.toMatchObject({
			status: 400,
		});
	});

	it('rejects a conversation not ending in a user turn with 400', async () => {
		await expect(
			POST(post({ messages: [{ role: 'user', content: 'q' }, { role: 'assistant', content: 'a' }] })),
		).rejects.toMatchObject({ status: 400 });
		expect(answerQuestion).not.toHaveBeenCalled();
	});

	it('returns 503 when the chat is not configured', async () => {
		isChatConfigured.mockResolvedValue(false);
		await expect(POST(post({ messages: USER_MSG }))).rejects.toMatchObject({ status: 503 });
		expect(answerQuestion).not.toHaveBeenCalled();
	});
});

describe('POST /api/nazu/chat — streaming', () => {
	it('streams assistant events as SSE frames and closes with done', async () => {
		answerQuestion.mockReturnValue(
			(async function* () {
				yield { type: 'sources', sources: [{ n: 1, id: 'a', title: 'A', type: 'note' }] };
				yield { type: 'delta', text: 'hi [1]' };
			})(),
		);

		const res = await POST(post({ messages: USER_MSG }));
		expect(res.status).toBe(200);
		expect(res.headers.get('Content-Type')).toBe('text/event-stream');

		const body = await res.text();
		const events = body
			.split('\n\n')
			.filter((f) => f.startsWith('data: '))
			.map((f) => JSON.parse(f.slice(6)));
		expect(events).toEqual([
			{ type: 'sources', sources: [{ n: 1, id: 'a', title: 'A', type: 'note' }] },
			{ type: 'delta', text: 'hi [1]' },
			{ type: 'done' },
		]);
		expect(answerQuestion).toHaveBeenCalledWith(USER_MSG);
	});

	it('emits an error frame when generation fails mid-stream', async () => {
		answerQuestion.mockReturnValue(
			(async function* () {
				yield { type: 'sources', sources: [] };
				throw new Error('boom');
			})(),
		);

		const res = await POST(post({ messages: USER_MSG }));
		const body = await res.text();
		expect(body).toContain('"type":"error"');
		expect(body).toContain('The assistant failed to respond.');
		expect(body).not.toContain('"type":"done"');
	});
});
