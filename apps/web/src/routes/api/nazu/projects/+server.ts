import { json } from '@sveltejs/kit';
import { getOpenTasks } from '$lib/server/tasks.js';

export async function GET() {
	const tasks = await getOpenTasks();
	return json(tasks.length > 0 ? [{ topic: 'tasks', tasks }] : []);
}
