import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { runInGraph } from '$lib/server/falkordb.js';

function str(v: unknown): string {
	return v == null ? '' : String(v);
}

export const GET: RequestHandler = async ({ params }) => {
	const { project } = params;
	if (!project) error(400, 'project is required');

	const graph = `code:${project}`;

	try {
		const [fileCounts, symbolCounts, deps, services, envvars, projectMeta] = await Promise.all([
			runInGraph(graph, `MATCH (f:File) RETURN f.language, count(f) ORDER BY count(f) DESC`),
			runInGraph(graph, `MATCH (s:Symbol) RETURN s.kind, count(s) ORDER BY count(s) DESC`),
			runInGraph(graph, `MATCH (d:Dependency) RETURN d.name, d.version, d.ecosystem ORDER BY d.name LIMIT 50`),
			runInGraph(graph, `MATCH (svc:Service) RETURN svc.name, svc.technology`),
			runInGraph(graph, `MATCH (e:EnvVar) RETURN e.name, e.purpose`),
			runInGraph(graph, `MATCH (p:Project {name: '${project}'}) RETURN p.path, p.languages, p.last_indexed`),
		]);

		return json({
			project,
			graph,
			meta: projectMeta[0]
				? { path: str(projectMeta[0][0]), languages: projectMeta[0][1], last_indexed: projectMeta[0][2] }
				: null,
			files: fileCounts.map((r) => ({ language: str(r[0]), count: Number(r[1]) })),
			symbols: symbolCounts.map((r) => ({ kind: str(r[0]), count: Number(r[1]) })),
			dependencies: deps.map((r) => ({ name: str(r[0]), version: str(r[1]), ecosystem: str(r[2]) })),
			services: services.map((r) => ({ name: str(r[0]), technology: str(r[1]) })),
			envvars: envvars.map((r) => ({ name: str(r[0]), purpose: str(r[1]) })),
		});
	} catch (err) {
		error(500, `Failed to query graph: ${err instanceof Error ? err.message : String(err)}`);
	}
};
