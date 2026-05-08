import { json } from '@sveltejs/kit';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

interface ProjectEntry {
	name: string;
	path: string;
	graph: string;
	github?: string;
}

function loadProjects(): ProjectEntry[] {
	const registry = resolve(process.cwd(), '../indexer/projects.json');
	return JSON.parse(readFileSync(registry, 'utf8')) as ProjectEntry[];
}

export async function GET() {
	try {
		const projects = loadProjects();
		return json(projects);
	} catch {
		return json([]);
	}
}
