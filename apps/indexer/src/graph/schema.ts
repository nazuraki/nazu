import { runInGraph } from './client.js';

export async function ensureSchema(graph: string): Promise<void> {
	const indexes = [
		`CREATE INDEX FOR (n:Symbol) ON (n.fqn)`,
		`CREATE INDEX FOR (n:Symbol) ON (n.name)`,
		`CREATE INDEX FOR (n:File) ON (n.path)`,
		`CREATE INDEX FOR (n:Dependency) ON (n.name)`,
		`CREATE INDEX FOR (n:EnvVar) ON (n.name)`,
		`CREATE INDEX FOR (n:Service) ON (n.name)`,
	];

	for (const idx of indexes) {
		try {
			await runInGraph(graph, idx);
		} catch {
			// index may already exist
		}
	}
}
