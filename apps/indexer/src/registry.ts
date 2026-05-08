import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export interface ProjectEntry {
	name: string;
	path: string;
	graph: string;
	github?: string;
}

let _projects: ProjectEntry[] | null = null;

function registryPath(): string {
	// __dirname is apps/indexer/dist/ at runtime; projects.json lives at apps/indexer/
	return resolve(__dirname, '../projects.json');
}

export function loadProjects(): ProjectEntry[] {
	if (!_projects) {
		_projects = JSON.parse(readFileSync(registryPath(), 'utf8')) as ProjectEntry[];
	}
	return _projects;
}

export function findProject(name: string): ProjectEntry | undefined {
	return loadProjects().find((p) => p.name === name);
}

export function findProjectByRepo(repo: string): ProjectEntry | undefined {
	return loadProjects().find((p) => p.github === repo);
}
