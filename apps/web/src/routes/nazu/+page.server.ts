import { getRecent } from '$lib/server/librarian.js';
import { getOpenTasks } from '$lib/server/tasks.js';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const [recent, tasks] = await Promise.all([getRecent(8), getOpenTasks()]);
	return { recent, tasks };
};
