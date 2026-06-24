import { describe, it, expect } from 'vitest';

import { extractCitedIndices, parseSSE } from './chat-client';
import type { ChatEvent } from './types';

/** A byte stream emitting the given string chunks in order. */
function streamOf(chunks: string[]): ReadableStream<Uint8Array> {
	const enc = new TextEncoder();
	return new ReadableStream({
		start(c) {
			for (const ch of chunks) c.enqueue(enc.encode(ch));
			c.close();
		},
	});
}

async function drain(stream: ReadableStream<Uint8Array>): Promise<ChatEvent[]> {
	const out: ChatEvent[] = [];
	for await (const ev of parseSSE(stream)) out.push(ev);
	return out;
}

describe('parseSSE', () => {
	it('parses complete data frames into events', async () => {
		const events = await drain(
			streamOf([
				'data: {"type":"sources","sources":[]}\n\n',
				'data: {"type":"delta","text":"hi"}\n\n',
				'data: {"type":"done"}\n\n',
			]),
		);
		expect(events).toEqual([
			{ type: 'sources', sources: [] },
			{ type: 'delta', text: 'hi' },
			{ type: 'done' },
		]);
	});

	it('reassembles an event split across chunk boundaries', async () => {
		const events = await drain(streamOf(['data: {"type":"de', 'lta","text":"hel', 'lo"}\n\n']));
		expect(events).toEqual([{ type: 'delta', text: 'hello' }]);
	});

	it('handles multiple events arriving in a single chunk', async () => {
		const events = await drain(
			streamOf(['data: {"type":"delta","text":"a"}\n\ndata: {"type":"delta","text":"b"}\n\n']),
		);
		expect(events).toEqual([
			{ type: 'delta', text: 'a' },
			{ type: 'delta', text: 'b' },
		]);
	});

	it('skips malformed frames without aborting the stream', async () => {
		const events = await drain(
			streamOf(['data: {bad json}\n\n', 'data: {"type":"delta","text":"ok"}\n\n']),
		);
		expect(events).toEqual([{ type: 'delta', text: 'ok' }]);
	});
});

describe('extractCitedIndices', () => {
	it('returns distinct, sorted, in-range citation numbers', () => {
		expect(extractCitedIndices('uses [3] then [1] and [1] again', 5)).toEqual([1, 3]);
	});

	it('drops out-of-range markers', () => {
		expect(extractCitedIndices('see [2] and [9]', 3)).toEqual([2]);
	});

	it('returns [] when there are no citations', () => {
		expect(extractCitedIndices('no citations here', 4)).toEqual([]);
	});
});
