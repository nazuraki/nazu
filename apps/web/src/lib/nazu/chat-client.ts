import type { ChatEvent, ChatMessage, ChatSource } from './types.js';

/**
 * Parse a Server-Sent Events byte stream into {@link ChatEvent}s. Buffers across
 * chunk boundaries (one event may arrive split over several reads) and tolerates
 * malformed frames by skipping them.
 */
export async function* parseSSE(stream: ReadableStream<Uint8Array>): AsyncGenerator<ChatEvent> {
	const reader = stream.getReader();
	const decoder = new TextDecoder();
	let buffer = '';
	try {
		for (;;) {
			const { done, value } = await reader.read();
			if (done) break;
			buffer += decoder.decode(value, { stream: true });
			let sep: number;
			while ((sep = buffer.indexOf('\n\n')) !== -1) {
				const frame = buffer.slice(0, sep);
				buffer = buffer.slice(sep + 2);
				const dataLine = frame.split('\n').find((l) => l.startsWith('data:'));
				if (!dataLine) continue;
				const payload = dataLine.slice(5).trim();
				if (!payload) continue;
				try {
					yield JSON.parse(payload) as ChatEvent;
				} catch {
					// skip a malformed frame rather than abort the stream
				}
			}
		}
	} finally {
		reader.releaseLock();
	}
}

/**
 * The distinct, in-range citation numbers an answer references (e.g. `[1]`,
 * `[2][3]`), sorted ascending. Out-of-range and malformed markers are dropped.
 */
export function extractCitedIndices(text: string, max: number): number[] {
	const found = new Set<number>();
	for (const m of text.matchAll(/\[(\d+)\]/g)) {
		const n = parseInt(m[1], 10);
		if (n >= 1 && n <= max) found.add(n);
	}
	return [...found].sort((a, b) => a - b);
}

export interface ChatHandlers {
	onSources?: (sources: ChatSource[]) => void;
	onDelta?: (text: string) => void;
	onError?: (message: string) => void;
}

/**
 * POST a conversation to the chat endpoint and drive the SSE response into the
 * given handlers. Resolves when the stream ends; surfaces transport and
 * server-reported failures via `onError`.
 */
export async function sendChat(messages: ChatMessage[], handlers: ChatHandlers): Promise<void> {
	let res: Response;
	try {
		res = await fetch('/api/nazu/chat', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ messages }),
		});
	} catch {
		handlers.onError?.('Could not reach the assistant.');
		return;
	}

	if (!res.ok || !res.body) {
		let message = 'The assistant is unavailable.';
		try {
			const j = await res.json();
			if (typeof j?.message === 'string') message = j.message;
		} catch {
			// non-JSON error body — keep the generic message
		}
		handlers.onError?.(message);
		return;
	}

	for await (const ev of parseSSE(res.body)) {
		if (ev.type === 'sources') handlers.onSources?.(ev.sources);
		else if (ev.type === 'delta') handlers.onDelta?.(ev.text);
		else if (ev.type === 'error') handlers.onError?.(ev.message);
		// 'done' ends the stream — the loop exits when the body closes.
	}
}
