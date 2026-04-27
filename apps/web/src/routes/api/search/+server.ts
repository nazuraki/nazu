import { json, error } from '@sveltejs/kit';
import { search } from '$lib/server/librarian';

export async function GET({ url }) {
	const q = url.searchParams.get('q')?.trim();
	if (!q) return error(400, 'q is required');
	const page = parseInt(url.searchParams.get('page') ?? '1', 10);
	const pageSize = parseInt(url.searchParams.get('page_size') ?? '20', 10);
	try {
		return json(await search(q, page, pageSize));
	} catch (e) {
		console.error('search error', e);
		return error(500, 'search failed');
	}
}
