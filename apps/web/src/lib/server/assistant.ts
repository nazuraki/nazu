import Anthropic from '@anthropic-ai/sdk';

import { search } from './librarian.js';
import { getSection } from './settings.js';

import type { ChatEvent, ChatMessage, ChatSource } from '$lib/nazu/types.js';
import type { Entry } from '$lib/search/types.js';

/**
 * Raised when the chat is invoked without an Anthropic key configured. The
 * route maps this to a 503 so the UI can prompt the user to add a key in
 * Settings → AI. `answerQuestion` also guards on this defensively.
 */
export class AssistantConfigError extends Error {
	constructor(message = 'no Anthropic API key configured') {
		super(message);
		this.name = 'AssistantConfigError';
	}
}

const DEFAULT_MODEL = 'claude-sonnet-4-6';
/** How many KB entries to retrieve as context for a question. */
const RETRIEVAL_K = 6;
/** Cap on conversation turns sent to the model, to bound token cost. */
const MAX_HISTORY = 10;
/** Cap on the answer length. */
const MAX_TOKENS = 1024;
/** Stand-in context when retrieval finds nothing. */
const NO_SOURCES = '(no relevant entries found in the knowledge base)';

/** True when an Anthropic key is configured (the chat's only hard dependency). */
export async function isChatConfigured(): Promise<boolean> {
	const { anthropicApiKey } = await getSection('ai');
	return Boolean((anthropicApiKey as string)?.trim());
}

/** The grounding instructions handed to the model as the system prompt. */
export function buildSystemPrompt(): string {
	return [
		'You are nazu, a personal knowledge assistant. Answer the user question using ONLY the numbered sources provided in the next message.',
		'',
		'Rules:',
		'- Ground every claim in the sources. Do not rely on outside knowledge.',
		'- Cite the sources you use inline with their bracketed number, e.g. [1] or [2][3].',
		'- If the sources do not contain the answer, say so plainly — do not guess.',
		'- Be concise and direct.',
	].join('\n');
}

/** Assign 1-based citation numbers to retrieved entries (for the UI). */
export function toSources(entries: Entry[]): ChatSource[] {
	return entries.map((e, i) => ({ n: i + 1, id: e.id, title: e.title, type: e.type }));
}

/**
 * Render retrieved entries into a numbered context block the model can cite by
 * `[n]`. Each block carries the title, type, and the best available preview
 * (chunk snippet, else excerpt). Returns a sentinel when nothing was retrieved.
 */
export function buildContextBlock(entries: Entry[]): string {
	if (entries.length === 0) return NO_SOURCES;
	return entries
		.map((e, i) => {
			const preview = (e.snippet || e.excerpt || '').trim() || '(no preview available)';
			return `[${i + 1}] ${e.title} (${e.type})\n${preview}`;
		})
		.join('\n\n');
}

/** The latest user turn's text, or '' if there is none. */
function latestQuestion(messages: ChatMessage[]): string {
	for (let i = messages.length - 1; i >= 0; i--) {
		if (messages[i].role === 'user') return messages[i].content.trim();
	}
	return '';
}

/**
 * Answer a chat turn with retrieval-augmented generation: retrieve KB entries
 * for the latest question, hand them to Claude as numbered citable context, and
 * stream the grounded answer. Yields a single `sources` event up front, then a
 * `delta` per text chunk. Throws {@link AssistantConfigError} when no key is set.
 */
export async function* answerQuestion(messages: ChatMessage[]): AsyncGenerator<ChatEvent> {
	const { anthropicApiKey, chatModel } = await getSection('ai');
	const apiKey = (anthropicApiKey as string)?.trim();
	if (!apiKey) throw new AssistantConfigError();
	const model = (chatModel as string)?.trim() || DEFAULT_MODEL;

	const question = latestQuestion(messages);

	// Retrieve context for the latest question (v1: latest turn verbatim — no
	// multi-turn query rewriting yet).
	let entries: Entry[] = [];
	if (question) {
		const res = await search(question, 1, RETRIEVAL_K);
		entries = res.entries;
	}
	const sources = toSources(entries);
	yield { type: 'sources', sources };

	// Compose the model input: prior turns for continuity, then a final user turn
	// that pairs the retrieved context with the question.
	const recent = messages.slice(-MAX_HISTORY);
	const prior = recent.slice(0, -1).map((m) => ({ role: m.role, content: m.content }));
	const composed = {
		role: 'user' as const,
		content: `Sources:\n${buildContextBlock(entries)}\n\nQuestion: ${question}`,
	};

	const stream = new Anthropic({ apiKey }).messages.stream({
		model,
		max_tokens: MAX_TOKENS,
		system: [{ type: 'text', text: buildSystemPrompt(), cache_control: { type: 'ephemeral' } }],
		messages: [...prior, composed],
	});

	for await (const event of stream) {
		if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
			yield { type: 'delta', text: event.delta.text };
		}
	}
}
