import { json, error } from '@sveltejs/kit';
import Anthropic from '@anthropic-ai/sdk';

import { getSql } from '$lib/server/db.js';
import { getSection } from '$lib/server/settings.js';
import { uploadDocument } from '$lib/server/storage.js';

async function anthropic(): Promise<Anthropic> {
	const { anthropicApiKey } = await getSection('ai');
	const apiKey = (anthropicApiKey as string)?.trim();
	if (!apiKey) throw error(503, 'Anthropic API key is not configured — set it in Settings');
	return new Anthropic({ apiKey });
}

async function generateExcerpt(title: string, content: string): Promise<string> {
	const preview = content.slice(0, 8000);
	const msg = await (await anthropic()).messages.create({
		model: 'claude-haiku-4-5',
		max_tokens: 256,
		system: [
			{
				type: 'text',
				text: 'You generate concise 2-3 sentence summaries of documents. Respond with only the summary — no preamble, no labels.',
				cache_control: { type: 'ephemeral' }
			}
		],
		messages: [
			{
				role: 'user',
				content: `Title: ${title}\n\n${preview}`
			}
		]
	});
	const block = msg.content.find((b) => b.type === 'text');
	return block?.type === 'text' ? block.text.trim() : '';
}

function countWords(text: string): number {
	return text.trim().split(/\s+/).filter(Boolean).length;
}

export async function POST({ request }) {
	let body: {
		title: string;
		content: string;
		type: string;
		author?: string;
		tags?: string;
		source_url?: string;
	};

	try {
		body = await request.json();
	} catch {
		return error(400, 'invalid JSON body');
	}

	const { title, content, type, author, tags: tagsRaw, source_url } = body;

	if (!title?.trim()) return error(400, 'title is required');
	if (!content?.trim()) return error(400, 'content is required');

	const tags = (tagsRaw ?? '')
		.split(',')
		.map((t) => t.trim().toLowerCase())
		.filter(Boolean);

	const wordCount = countWords(content);

	const sql = getSql();

	// Insert document first to get its id for the storage key
	const [doc] = await sql<{ id: string }[]>`
		INSERT INTO documents (storage_key, content_type, filename, source_url, author)
		VALUES ('placeholder', 'text/markdown', ${title.trim() + '.md'}, ${source_url ?? null}, ${author ?? null})
		RETURNING id
	`;

	const storageKey = `documents/${doc.id}.md`;

	// Upload to MinIO
	await uploadDocument(storageKey, content, 'text/markdown');

	// Update the storage key now that we have the id
	await sql`UPDATE documents SET storage_key = ${storageKey} WHERE id = ${doc.id}`;

	// Generate excerpt via Claude — fall back to empty on failure (e.g. missing API key in test)
	let excerpt = '';
	try {
		excerpt = await generateExcerpt(title.trim(), content);
	} catch {
		// intentionally swallowed — excerpt is non-critical
	}

	// Insert kb_index entry
	const [entry] = await sql<{ id: string }[]>`
		INSERT INTO kb_index (document_id, title, excerpt, type, tags, word_count)
		VALUES (${doc.id}, ${title.trim()}, ${excerpt}, ${type ?? 'note'}, ${tags}, ${wordCount})
		RETURNING id
	`;

	return json({ id: entry.id, title: title.trim() }, { status: 201 });
}
