import { json, error } from '@sveltejs/kit';
import { storeDocument, normalizeTags } from '$lib/server/ingest.js';

/** Derive a short title from the body when an agent doesn't supply one. */
function deriveTitle(content: string): string {
	const firstLine = content
		.split('\n')
		.map((l) => l.trim())
		.find(Boolean);
	const base = (firstLine ?? content.trim()).replace(/^#+\s*/, '').trim();
	return base.length > 80 ? base.slice(0, 79).trimEnd() + '…' : base;
}

/**
 * Agent-facing write: store a fact/note with minimal ceremony. Unlike `/api/ingest`
 * (the human form), `title` is optional and derived from `content` when absent.
 */
export async function POST({ request }) {
	let body: {
		content?: string;
		title?: string;
		type?: string;
		author?: string;
		tags?: string | string[];
		source_url?: string;
	};

	try {
		body = await request.json();
	} catch {
		return error(400, 'invalid JSON body');
	}

	const content = body.content?.trim();
	if (!content) return error(400, 'content is required');

	const result = await storeDocument({
		title: body.title?.trim() || deriveTitle(content),
		content,
		type: body.type ?? 'note',
		author: body.author ?? null,
		tags: normalizeTags(body.tags),
		source_url: body.source_url ?? null
	});

	return json({ id: result.id, title: result.title }, { status: 201 });
}
