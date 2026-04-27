import { json, error } from '@sveltejs/kit';
import { getSql } from '$lib/server/db.js';

export async function POST({ request }) {
	const body = await request.json();
	const ids = body.ids;
	if (!Array.isArray(ids) || ids.some((i) => typeof i !== 'string')) {
		throw error(400, 'ids must be an array of strings');
	}

	const sql = getSql();
	await sql.begin(async (tx) => {
		for (let i = 0; i < ids.length; i++) {
			await tx`UPDATE tasks SET sort_order = ${i} WHERE id = ${ids[i]}`;
		}
	});
	return json({ ok: true });
}
