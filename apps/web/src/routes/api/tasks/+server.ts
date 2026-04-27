import { json, error } from '@sveltejs/kit';
import { getSql } from '$lib/server/db.js';

const STATUSES = ['pending', 'done', 'blocked', 'note'] as const;

export async function GET() {
	const sql = getSql();
	const rows = await sql`
		SELECT id, description, status, due_date, completion_date, parent_id, sort_order, created_at, updated_at
		FROM tasks
		ORDER BY sort_order ASC, created_at ASC
	`;
	return json(rows);
}

export async function POST({ request }) {
	const body = await request.json();
	const description = (body.description ?? '').trim();
	if (!description) throw error(400, 'description required');

	const status = body.status ?? 'pending';
	if (!STATUSES.includes(status)) throw error(400, 'invalid status');

	const parent_id = body.parent_id ?? null;

	const sql = getSql();

	if (parent_id) {
		const [parent] = await sql<{ id: string }[]>`SELECT id FROM tasks WHERE id = ${parent_id}`;
		if (!parent) throw error(400, 'parent_id not found');
	}

	const [{ next }] = await sql<{ next: number }[]>`
		SELECT COALESCE(MAX(sort_order), -1) + 1 AS next
		FROM tasks
		WHERE ${parent_id ? sql`parent_id = ${parent_id}` : sql`parent_id IS NULL`}
	`;

	const completion_date = status === 'done' ? new Date().toISOString().slice(0, 10) : null;

	const [row] = await sql`
		INSERT INTO tasks (description, status, sort_order, due_date, parent_id, completion_date)
		VALUES (${description}, ${status}, ${next}, ${body.due_date ?? null}, ${parent_id}, ${completion_date})
		RETURNING id, description, status, due_date, completion_date, parent_id, sort_order, created_at, updated_at
	`;
	return json(row, { status: 201 });
}
