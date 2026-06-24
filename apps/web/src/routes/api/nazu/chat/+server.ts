import { error } from '@sveltejs/kit';

import { answerQuestion, AssistantConfigError, isChatConfigured } from '$lib/server/assistant.js';

import type { ChatEvent, ChatMessage } from '$lib/nazu/types.js';
import type { RequestHandler } from './$types';

/** Validate the request body into a non-empty, user-terminated message list. */
function parseMessages(body: unknown): ChatMessage[] {
	const messages = (body as { messages?: unknown })?.messages;
	if (!Array.isArray(messages) || messages.length === 0) {
		throw error(400, 'messages is required');
	}
	for (const m of messages) {
		if (!m || (m.role !== 'user' && m.role !== 'assistant') || typeof m.content !== 'string') {
			throw error(400, 'each message needs role "user"|"assistant" and string content');
		}
	}
	if (messages[messages.length - 1].role !== 'user') {
		throw error(400, 'the last message must be from the user');
	}
	return messages as ChatMessage[];
}

/**
 * Stream a RAG answer for the conversation as Server-Sent Events. Each yielded
 * {@link ChatEvent} is one `data:` frame; the stream ends with a `done` event,
 * or an `error` event if generation fails mid-flight.
 */
export const POST: RequestHandler = async ({ request }) => {
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		throw error(400, 'invalid JSON body');
	}
	const messages = parseMessages(body);

	if (!(await isChatConfigured())) {
		throw error(503, 'No Anthropic API key configured. Add one in Settings → AI.');
	}

	const enc = new TextEncoder();
	const stream = new ReadableStream({
		async start(controller) {
			const send = (e: ChatEvent) => controller.enqueue(enc.encode(`data: ${JSON.stringify(e)}\n\n`));
			try {
				for await (const ev of answerQuestion(messages)) send(ev);
				send({ type: 'done' });
			} catch (err) {
				const message =
					err instanceof AssistantConfigError
						? 'No Anthropic API key configured. Add one in Settings → AI.'
						: 'The assistant failed to respond.';
				if (!(err instanceof AssistantConfigError)) console.error('nazu chat failed', err);
				send({ type: 'error', message });
			} finally {
				controller.close();
			}
		},
	});

	return new Response(stream, {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache',
			Connection: 'keep-alive',
		},
	});
};
