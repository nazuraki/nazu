import { getSection } from './settings.js';

/**
 * Per-repo CI/Pages workflow resolution. Status uses a single dashboard-wide
 * default; Pages deploys vary per repo and are stored as a `dashboard`
 * `pagesWorkflows` list of `owner/repo=workflow.yml` entries.
 */

export async function getStatusWorkflow(): Promise<string | undefined> {
	const d = await getSection('dashboard');
	return (d.statusWorkflow as string)?.trim() || undefined;
}

export async function getPagesWorkflow(fullName: string): Promise<string | undefined> {
	const d = await getSection('dashboard');
	const entries = (d.pagesWorkflows as string[]) ?? [];
	for (const entry of entries) {
		const eq = entry.indexOf('=');
		if (eq === -1) continue;
		if (entry.slice(0, eq).trim() === fullName) return entry.slice(eq + 1).trim() || undefined;
	}
	return undefined;
}
