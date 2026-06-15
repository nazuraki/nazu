import Anthropic from '@anthropic-ai/sdk';

import { getSql } from './db.js';
import { getSection } from './settings.js';
import { uploadDocument } from './storage.js';

/** A unit of knowledge to persist into the KB (Postgres `kb_index` + `documents`
 *  metadata + the original body in MinIO). Shared by the human `/api/ingest`
 *  form path and the agent-facing `/api/remember` endpoint. */
export interface StoreInput {
	title: string;
	content: string;
	type?: string;
	author?: string | null;
	tags?: string[];
	source_url?: string | null;
}

export interface StoreResult {
	/** kb_index entry id */
	id: string;
	title: string;
	/** documents row id */
	document_id: string;
}

/** Generate a 2-3 sentence excerpt via Claude Haiku. Best-effort: returns '' when
 *  no key is configured (so ingest degrades gracefully instead of failing). */
async function generateExcerpt(title: string, content: string): Promise<string> {
	const { anthropicApiKey } = await getSection('ai');
	const apiKey = (anthropicApiKey as string)?.trim();
	if (!apiKey) return '';

	const msg = await new Anthropic({ apiKey }).messages.create({
		model: 'claude-haiku-4-5',
		max_tokens: 256,
		system: [
			{
				type: 'text',
				text: 'You generate concise 2-3 sentence summaries of documents. Respond with only the summary — no preamble, no labels.',
				cache_control: { type: 'ephemeral' }
			}
		],
		messages: [{ role: 'user', content: `Title: ${title}\n\n${content.slice(0, 8000)}` }]
	});
	const block = msg.content.find((b) => b.type === 'text');
	return block?.type === 'text' ? block.text.trim() : '';
}

function countWords(text: string): number {
	return text.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Persist a document end to end: insert the `documents` metadata row, upload the
 * original body to object storage, generate a best-effort excerpt, and create the
 * `kb_index` entry that makes it discoverable via search/recall.
 */
export async function storeDocument(input: StoreInput): Promise<StoreResult> {
	const title = input.title.trim();
	const type = input.type?.trim() || 'note';
	const tags = input.tags ?? [];
	const wordCount = countWords(input.content);
	const sql = getSql();

	// Insert document first to get its id for the storage key.
	const [doc] = await sql<{ id: string }[]>`
		INSERT INTO documents (storage_key, content_type, filename, source_url, author)
		VALUES ('placeholder', 'text/markdown', ${title + '.md'}, ${input.source_url ?? null}, ${input.author ?? null})
		RETURNING id
	`;

	const storageKey = `documents/${doc.id}.md`;
	await uploadDocument(storageKey, input.content, 'text/markdown');
	await sql`UPDATE documents SET storage_key = ${storageKey} WHERE id = ${doc.id}`;

	// Excerpt is non-critical — never let it fail the write.
	let excerpt = '';
	try {
		excerpt = await generateExcerpt(title, input.content);
	} catch {
		// intentionally swallowed
	}

	const [entry] = await sql<{ id: string }[]>`
		INSERT INTO kb_index (document_id, title, excerpt, type, tags, word_count)
		VALUES (${doc.id}, ${title}, ${excerpt}, ${type}, ${tags}, ${wordCount})
		RETURNING id
	`;

	return { id: entry.id, title, document_id: doc.id };
}

/** Normalize a comma-separated or array tag input to a deduped lowercase list. */
export function normalizeTags(tags: string | string[] | undefined): string[] {
	const raw = Array.isArray(tags) ? tags : (tags ?? '').split(',');
	return [...new Set(raw.map((t) => t.trim().toLowerCase()).filter(Boolean))];
}
