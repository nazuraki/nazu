import { json, error } from '@sveltejs/kit';
import { getEntry } from '$lib/server/falkordb';

export async function GET({ params }) {
	try {
		const entry = await getEntry(params.id);
		if (!entry) return error(404, 'entry not found');
		return json(entry);
	} catch (e) {
		console.error('search entry error', e);
		return error(500, 'failed to fetch entry');
	}
}
