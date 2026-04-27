import { json, error } from '@sveltejs/kit';
import { getSql } from '$lib/server/db.js';

export async function PATCH({ params, request }) {
	const body = await request.json();
	const sql = getSql();

	const sets: Record<string, unknown> = {};
	if (typeof body.description === 'string') {
		const d = body.description.trim();
		if (!d) throw error(400, 'description cannot be empty');
		sets.description = d;
	}
	if (typeof body.status === 'string') sets.status = body.status;
	if ('due_date' in body) sets.due_date = body.due_date;

	if (Object.keys(sets).length === 0) throw error(400, 'no fields to update');

	const [row] = await sql`
		UPDATE tasks SET ${sql(sets)} WHERE id = ${params.id}
		RETURNING id, description, status, due_date, sort_order, created_at, updated_at
	`;
	if (!row) throw error(404, 'not found');
	return json(row);
}

export async function DELETE({ params }) {
	const sql = getSql();
	const rows = await sql`DELETE FROM tasks WHERE id = ${params.id} RETURNING id`;
	if (rows.length === 0) throw error(404, 'not found');
	return new Response(null, { status: 204 });
}
