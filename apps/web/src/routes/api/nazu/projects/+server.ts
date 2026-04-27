import { json } from '@sveltejs/kit';
import { getSql } from '$lib/server/db.js';

export async function GET() {
	const sql = getSql();
	const rows = await sql<{ id: string; description: string }[]>`
		SELECT id, description
		FROM tasks
		WHERE status IN ('pending', 'blocked')
		  AND parent_id IS NULL
		ORDER BY sort_order ASC, created_at ASC
	`;

	const tasks = rows.map((r) => ({ id: r.id, title: r.description, priority: null }));
	return json(tasks.length > 0 ? [{ topic: "tasks", tasks }] : []);
}
