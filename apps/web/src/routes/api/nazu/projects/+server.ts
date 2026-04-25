import { json } from '@sveltejs/kit';
import { getSql } from '$lib/server/db.js';

export async function GET() {
	const sql = getSql();
	const rows = await sql<{ id: string; description: string }[]>`
		SELECT id, description
		FROM tasks
		WHERE status != 'done'
		  AND status != 'complete'
		ORDER BY created_at
	`;

	const tasks = rows.map((r) => ({ id: r.id, title: r.description, priority: null }));
	return json(tasks.length > 0 ? [{ topic: "tasks", tasks }] : []);
}
