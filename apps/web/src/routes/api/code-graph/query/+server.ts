import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { runInGraph } from '$lib/server/falkordb.js';

export const POST: RequestHandler = async ({ request }) => {
	const body = await request.json() as { project?: string; graph?: string; cypher?: string };
	const { project, graph, cypher } = body;

	if (!cypher) error(400, 'cypher is required');

	const graphName = graph ?? (project ? `code:${project}` : undefined);
	if (!graphName) error(400, 'project or graph is required');

	try {
		const rows = await runInGraph(graphName, cypher);
		return json({ graph: graphName, rows });
	} catch (err) {
		error(500, `Query failed: ${err instanceof Error ? err.message : String(err)}`);
	}
};
