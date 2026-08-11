/** REST client + text formatters for the backplane MCP tools. */

const BACKPLANE_URL = (process.env.BACKPLANE_URL ?? 'http://localhost:8430').replace(/\/+$/, '');
const API_KEY = process.env.BACKPLANE_API_KEY?.trim() ?? '';

interface Project {
	name: string;
	gitUrl: string;
	branch: string;
	images: string[];
	autoDeploy: boolean;
	target: { type: string; projectName?: string; profiles?: string[] };
}

export async function api<T>(path: string, method = 'GET', asText = false): Promise<T> {
	const headers: Record<string, string> = API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {};
	const res = await fetch(`${BACKPLANE_URL}${path}`, { method, headers });
	if (!res.ok) throw new Error(`${method} ${path} failed: HTTP ${res.status} — ${await res.text()}`);
	return (asText ? res.text() : res.json()) as Promise<T>;
}

export async function formatProjects(): Promise<string> {
	const { projects } = await api<{ projects: Project[] }>('/api/projects');
	if (projects.length === 0) return 'No projects registered.';
	return projects
		.map(
			(p) =>
				`• ${p.name} — ${p.gitUrl} (${p.branch})\n` +
				`  target: ${p.target.type}${p.target.profiles?.length ? ` profiles=[${p.target.profiles.join(', ')}]` : ''}` +
				`, auto-deploy: ${p.autoDeploy ? 'on' : 'off'}\n` +
				`  images: ${p.images.length ? p.images.join(', ') : '(none watched)'}`,
		)
		.join('\n\n');
}

export async function formatStatus(name: string): Promise<string> {
	const { services } = await api<{
		services: { service: string; state: string; status: string; image: string }[];
	}>(`/api/projects/${name}/status`);
	if (services.length === 0) return `${name}: no services (never deployed?).`;
	return (
		`${name} services:\n` +
		services.map((s) => `• ${s.service} [${s.state}] ${s.status} — ${s.image}`).join('\n')
	);
}

export async function formatUpdates(name: string): Promise<string> {
	const { updates } = await api<{
		updates: { image: string; updateAvailable: boolean; error?: string }[];
	}>(`/api/projects/${name}/updates`);
	if (updates.length === 0) return 'No images watched.';
	return updates
		.map((u) => {
			if (u.error) return `• ${u.image}: check failed (${u.error})`;
			return `• ${u.image}: ${u.updateAvailable ? 'UPDATE AVAILABLE' : 'up to date'}`;
		})
		.join('\n');
}

export async function formatSelf(): Promise<string> {
	const { self, helper, error } = await api<{
		self: { image: string; updateAvailable: boolean; error?: string } | null;
		helper: { state: string; exitCode: number | null; logs: string[] } | null;
		error?: string;
	}>('/api/self');
	if (!self) return `Self-update unavailable: ${error ?? 'unknown reason'}`;
	const lines = [
		`backplane image ${self.image}: ${
			self.error ? `check failed (${self.error})` : self.updateAvailable ? 'UPDATE AVAILABLE' : 'up to date'
		}`,
	];
	if (helper) {
		const outcome = helper.state === 'running' ? 'running' : `${helper.state} (exit ${helper.exitCode})`;
		lines.push(`last self-update helper: ${outcome}`);
		if (helper.logs.length) lines.push(...helper.logs.slice(-10).map((l) => `  ${l}`));
	}
	return lines.join('\n');
}

export async function formatDeploy(name: string, id: number): Promise<string> {
	const { deploy } = await api<{
		deploy: { id: number; action: string; status: string; startedAt: string; finishedAt: string | null; log: string };
	}>(`/api/projects/${name}/deploys/${id}`);
	const dur = deploy.finishedAt ? ` (finished ${deploy.finishedAt})` : ' (still running)';
	const log = deploy.log.trim();
	return (
		`${deploy.action} #${deploy.id} on ${name}: ${deploy.status}${dur}\n\n` +
		(log ? `Log:\n${log.split('\n').slice(-60).join('\n')}` : '(no log yet)')
	);
}
