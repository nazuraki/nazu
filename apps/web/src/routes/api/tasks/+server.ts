import { json, error } from '@sveltejs/kit';
import { getSql } from '$lib/server/db.js';

export async function GET() {
	const sql = getSql();
	const rows = await sql`
		SELECT id, description, status, due_date, sort_order, created_at, updated_at
		FROM tasks
		ORDER BY sort_order ASC, created_at ASC
	`;
	return json(rows);
}

export async function POST({ request }) {
	const body = await request.json();
	const description = (body.description ?? '').trim();
	if (!description) throw error(400, 'description required');

	const sql = getSql();
	const [{ next }] = await sql<{ next: number }[]>`
		SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM tasks
	`;
	const [row] = await sql`
		INSERT INTO tasks (description, sort_order, due_date)
		VALUES (${description}, ${next}, ${body.due_date ?? null})
		RETURNING id, description, status, due_date, sort_order, created_at, updated_at
	`;
	return json(row, { status: 201 });
}
