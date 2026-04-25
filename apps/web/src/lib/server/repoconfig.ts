import { env } from '$env/dynamic/private';
import reposJson from '../../../repos.json' with { type: 'json' };

interface RepoConfig {
	statusWorkflow?: string;
	pagesWorkflow?: string;
}

interface ReposConfig {
	repos: Record<string, RepoConfig>;
}

const config = reposJson as ReposConfig;

export function getStatusWorkflow(fullName: string): string | undefined {
	return config.repos[fullName]?.statusWorkflow ?? env.STATUS_WORKFLOW;
}

export function getPagesWorkflow(fullName: string): string | undefined {
	return config.repos[fullName]?.pagesWorkflow;
}
