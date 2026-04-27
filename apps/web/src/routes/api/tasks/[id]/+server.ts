import { json, error } from '@sveltejs/kit';
import { getSql } from '$lib/server/db.js';

const STATUSES = ['pending', 'done', 'blocked', 'note'] as const;

export async function PATCH({ params, request }) {
	const body = await request.json();
	const sql = getSql();

	const sets: Record<string, unknown> = {};
	if (typeof body.description === 'string') {
		const d = body.description.trim();
		if (!d) throw error(400, 'description cannot be empty');
		sets.description = d;
	}
	if (typeof body.status === 'string') {
		if (!STATUSES.includes(body.status)) throw error(400, 'invalid status');
		sets.status = body.status;
	}
	if ('due_date' in body) sets.due_date = body.due_date;
	if ('completion_date' in body) sets.completion_date = body.completion_date;
	if ('parent_id' in body) {
		if (body.parent_id === params.id) throw error(400, 'task cannot be its own parent');
		sets.parent_id = body.parent_id;
	}

	if (sets.status && !('completion_date' in body)) {
		sets.completion_date = sets.status === 'done' ? new Date().toISOString().slice(0, 10) : null;
	}

	if (Object.keys(sets).length === 0) throw error(400, 'no fields to update');

	const [row] = await sql`
		UPDATE tasks SET ${sql(sets)} WHERE id = ${params.id}
		RETURNING id, description, status, due_date, completion_date, parent_id, sort_order, created_at, updated_at
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
