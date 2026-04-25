import { json, error } from '@sveltejs/kit';
import { getTags } from '$lib/server/falkordb';

export async function GET() {
	try {
		return json(await getTags());
	} catch (e) {
		console.error('librarian tags error', e);
		return error(500, 'failed to fetch tags');
	}
}
