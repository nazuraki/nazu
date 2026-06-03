import { getSection } from './settings.js';
import reposJson from '../../../repos.json' with { type: 'json' };

interface RepoConfig {
	statusWorkflow?: string;
	pagesWorkflow?: string;
}

interface ReposConfig {
	repos: Record<string, RepoConfig>;
}

const config = reposJson as ReposConfig;

export async function getStatusWorkflow(fullName: string): Promise<string | undefined> {
	const repoDefault = config.repos[fullName]?.statusWorkflow;
	if (repoDefault) return repoDefault;
	const d = await getSection('dashboard');
	return (d.statusWorkflow as string)?.trim() || undefined;
}

export function getPagesWorkflow(fullName: string): string | undefined {
	return config.repos[fullName]?.pagesWorkflow;
}
