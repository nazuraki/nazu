import { redirect, fail } from '@sveltejs/kit';

import { storeDocument, normalizeTags } from '$lib/server/ingest.js';

import type { Actions } from './$types.js';

export const actions: Actions = {
	default: async ({ request }) => {
		const data = await request.formData();

		const title = (data.get('title') as string)?.trim();
		const content = (data.get('content') as string)?.trim();
		const type = (data.get('type') as string) || 'note';
		const author = (data.get('author') as string)?.trim() || null;
		const tags = normalizeTags((data.get('tags') as string) || '');
		const source_url = (data.get('source_url') as string)?.trim() || null;

		if (!title) return fail(400, { error: 'Title is required', values: Object.fromEntries(data) });
		if (!content) return fail(400, { error: 'Content is required', values: Object.fromEntries(data) });

		// Single ingest code path — same helper the `/api/ingest` and `/api/remember`
		// endpoints use (no duplicated excerpt/insert logic).
		const entry = await storeDocument({ title, content, type, author, tags, source_url });

		redirect(302, `/search/entry/${entry.id}`);
	}
};
