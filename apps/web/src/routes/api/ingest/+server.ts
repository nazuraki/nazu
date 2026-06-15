import { json, error } from '@sveltejs/kit';
import { storeDocument, normalizeTags } from '$lib/server/ingest.js';

/** Human ingest path (the `/ingest` form posts here). `title` is required;
 *  agents that want title-optional behavior should use `/api/remember`. */
export async function POST({ request }) {
	let body: {
		title?: string;
		content?: string;
		type?: string;
		author?: string;
		tags?: string;
		source_url?: string;
	};

	try {
		body = await request.json();
	} catch {
		return error(400, 'invalid JSON body');
	}

	if (!body.title?.trim()) return error(400, 'title is required');
	if (!body.content?.trim()) return error(400, 'content is required');

	const result = await storeDocument({
		title: body.title,
		content: body.content,
		type: body.type ?? 'note',
		author: body.author ?? null,
		tags: normalizeTags(body.tags),
		source_url: body.source_url ?? null
	});

	return json({ id: result.id, title: result.title }, { status: 201 });
}
