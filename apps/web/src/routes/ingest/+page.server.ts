import { redirect, fail, error } from '@sveltejs/kit';
import Anthropic from '@anthropic-ai/sdk';

import { getSql } from '$lib/server/db.js';
import { getSection } from '$lib/server/settings.js';
import { uploadDocument } from '$lib/server/storage.js';

import type { Actions } from './$types.js';

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
		messages: [{ role: 'user', content: `Title: ${title}\n\n${preview}` }]
	});
	const block = msg.content.find((b) => b.type === 'text');
	return block?.type === 'text' ? block.text.trim() : '';
}

function countWords(text: string): number {
	return text.trim().split(/\s+/).filter(Boolean).length;
}

export const actions: Actions = {
	default: async ({ request }) => {
		const data = await request.formData();

		const title = (data.get('title') as string)?.trim();
		const content = (data.get('content') as string)?.trim();
		const type = (data.get('type') as string) || 'note';
		const author = (data.get('author') as string)?.trim() || null;
		const tagsRaw = (data.get('tags') as string) || '';
		const source_url = (data.get('source_url') as string)?.trim() || null;

		if (!title) return fail(400, { error: 'Title is required', values: Object.fromEntries(data) });
		if (!content) return fail(400, { error: 'Content is required', values: Object.fromEntries(data) });

		const tags = tagsRaw
			.split(',')
			.map((t) => t.trim().toLowerCase())
			.filter(Boolean);

		const wordCount = countWords(content);
		const sql = getSql();

		const [doc] = await sql<{ id: string }[]>`
			INSERT INTO documents (storage_key, content_type, filename, source_url, author)
			VALUES ('placeholder', 'text/markdown', ${title + '.md'}, ${source_url}, ${author})
			RETURNING id
		`;

		const storageKey = `documents/${doc.id}.md`;
		await uploadDocument(storageKey, content, 'text/markdown');
		await sql`UPDATE documents SET storage_key = ${storageKey} WHERE id = ${doc.id}`;

		let excerpt = '';
		try {
			excerpt = await generateExcerpt(title, content);
		} catch {
			// intentionally swallowed — excerpt is non-critical
		}

		const [entry] = await sql<{ id: string }[]>`
			INSERT INTO kb_index (document_id, title, excerpt, type, tags, word_count)
			VALUES (${doc.id}, ${title}, ${excerpt}, ${type}, ${tags}, ${wordCount})
			RETURNING id
		`;

		redirect(302, `/librarian/entry/${entry.id}`);
	}
};
