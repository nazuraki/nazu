import { json, error, isHttpError } from '@sveltejs/kit';
import { getEntry } from '$lib/server/librarian';

export async function GET({ params }) {
	try {
		const entry = await getEntry(params.id);
		if (!entry) error(404, 'entry not found');
		return json(entry);
	} catch (e) {
		if (isHttpError(e)) throw e;
		console.error('entries error', e);
		error(500, 'failed to fetch entry');
	}
}
