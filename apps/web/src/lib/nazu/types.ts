// Wire types shared between the /nazu chat server (lib/server/assistant.ts) and
// the browser client (lib/nazu/chat-client.ts). Types only — no runtime code —
// so the client never pulls in server-only modules.

/** A single conversation turn exchanged with the assistant. */
export interface ChatMessage {
	role: 'user' | 'assistant';
	content: string;
}

/** A retrieved KB entry offered to the model as citable context. `n` is the
 *  1-based citation number the model is told to reference inline as `[n]`. */
export interface ChatSource {
	n: number;
	id: string;
	title: string;
	type: string;
}

/**
 * Events carried over the chat SSE stream. `sources` is emitted once up front
 * (retrieval runs before the LLM call), `delta` streams answer text, `done`
 * marks a clean end, and `error` reports a failure. `answerQuestion` only
 * produces `sources`/`delta`; the route adds `done`/`error`.
 */
export type ChatEvent =
	| { type: 'sources'; sources: ChatSource[] }
	| { type: 'delta'; text: string }
	| { type: 'done' }
	| { type: 'error'; message: string };
