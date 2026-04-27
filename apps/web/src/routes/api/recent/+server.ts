import { json, error } from '@sveltejs/kit';
import { getRecent } from '$lib/server/librarian';

export async function GET({ url }) {
	const limit = parseInt(url.searchParams.get('limit') ?? '10', 10);
	try {
		return json(await getRecent(limit));
	} catch (e) {
		console.error('search recent error', e);
		return error(500, 'failed to fetch recent entries');
	}
}
