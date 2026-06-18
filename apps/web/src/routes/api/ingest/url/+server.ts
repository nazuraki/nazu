import { json, error } from '@sveltejs/kit';
import { fetchTranscript } from '$lib/server/transcript.js';
import { storeDocument, normalizeTags, findEntryBySourceUrl } from '$lib/server/ingest.js';

/**
 * Fetch a media URL's transcript and ingest it into the KB. Used by the Discord
 * bot (#34) and usable by any other automated source. Recognizes YouTube and
 * TikTok links; classification + fetching live in `lib/server/transcript.ts`.
 *
 * Responses:
 *   201 { status: 'ingested', id, title }   — stored
 *   200 { status: 'duplicate', id, title }  — this source_url was already stored
 *   422 { status: 'unsupported' }           — not a recognized media link
 *   422 { status: 'unavailable', ... }      — recognized, but no transcript
 *   400                                      — bad request
 */
export async function POST({ request }) {
	let body: { url?: string; postedBy?: string; tags?: string | string[] };
	try {
		body = await request.json();
	} catch {
		return error(400, 'invalid JSON body');
	}

	const url = body.url?.trim();
	if (!url) return error(400, 'url is required');

	const outcome = await fetchTranscript(url);
	if (outcome.status === 'unsupported') {
		return json({ status: 'unsupported', url }, { status: 422 });
	}
	if (outcome.status === 'unavailable') {
		return json(
			{ status: 'unavailable', platform: outcome.platform, reason: outcome.reason },
			{ status: 422 },
		);
	}

	// Idempotent for busy channels: the same link posted twice maps to one entry.
	const existing = await findEntryBySourceUrl(outcome.url);
	if (existing) {
		return json({ status: 'duplicate', id: existing.id, title: existing.title });
	}

	const extraTags = Array.isArray(body.tags) ? body.tags : (body.tags ?? '').split(',');
	const result = await storeDocument({
		title: outcome.title,
		content: outcome.text,
		type: 'transcript',
		author: outcome.author,
		tags: normalizeTags([...extraTags, 'discord', outcome.platform]),
		source_url: outcome.url,
	});

	return json({ status: 'ingested', id: result.id, title: result.title }, { status: 201 });
}
