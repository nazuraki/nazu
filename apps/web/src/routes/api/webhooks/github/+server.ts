import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { getSection } from '$lib/server/settings.js';

const REPO_CACHE_DIR = process.env.REPO_CACHE_DIR ?? '/var/cache/nazu/repos';

interface ProjectEntry {
	name: string;
	path: string;
	graph: string;
	github?: string;
}

interface PushPayload {
	ref: string;
	repository: {
		full_name: string;
		clone_url: string;
		default_branch: string;
	};
}

function loadProjects(): ProjectEntry[] {
	const registry = resolve(process.cwd(), '../indexer/projects.json');
	return JSON.parse(readFileSync(registry, 'utf8')) as ProjectEntry[];
}

async function verifySignature(body: string, signature: string): Promise<boolean> {
	const { webhookSecret } = await getSection('github');
	const secret = (webhookSecret as string)?.trim();
	if (!secret) return false;
	const expected = `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
	try {
		return timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
	} catch {
		return false;
	}
}

function cloneOrPull(repoUrl: string, cacheDir: string, defaultBranch: string): Promise<void> {
	return new Promise((resolve_p, reject) => {
		let proc;
		if (existsSync(cacheDir)) {
			proc = spawn('git', ['-C', cacheDir, 'fetch', 'origin', defaultBranch, '--depth=100'], { stdio: 'inherit' });
			proc.on('close', (code) => {
				if (code !== 0) { reject(new Error(`git fetch failed: ${code}`)); return; }
				const reset = spawn('git', ['-C', cacheDir, 'reset', '--hard', `origin/${defaultBranch}`], { stdio: 'inherit' });
				reset.on('close', (c) => c === 0 ? resolve_p() : reject(new Error(`git reset failed: ${c}`)));
			});
		} else {
			mkdirSync(cacheDir, { recursive: true });
			proc = spawn('git', ['clone', '--depth=100', repoUrl, cacheDir], { stdio: 'inherit' });
			proc.on('close', (code) => code === 0 ? resolve_p() : reject(new Error(`git clone failed: ${code}`)));
		}
		proc.on('error', reject);
	});
}

function spawnIndexer(projectPath: string, graphName: string, projectName: string) {
	const indexerCli = resolve(process.cwd(), '../indexer/dist/cli.js');

	// Detached — respond 200 immediately, indexing happens in background
	const proc = spawn(
		'node',
		[indexerCli, '--path', projectPath, '--graph', graphName],
		{ detached: true, stdio: 'ignore' }
	);
	proc.unref();

	console.log(`[webhook] spawned indexer for ${projectName} → ${graphName} (pid ${proc.pid})`);
}

export const POST: RequestHandler = async ({ request }) => {
	const event = request.headers.get('x-github-event');
	const signature = request.headers.get('x-hub-signature-256') ?? '';
	const body = await request.text();

	if (!(await verifySignature(body, signature))) {
		error(401, 'Invalid signature');
	}

	// Only handle push events
	if (event !== 'push') {
		return json({ ok: true, message: 'ignored' });
	}

	const payload = JSON.parse(body) as PushPayload;
	const repoFullName = payload.repository.full_name;
	const defaultBranch = payload.repository.default_branch;
	const cloneUrl = payload.repository.clone_url;

	// Check if this repo is registered
	const projects = loadProjects();
	const project = projects.find((p) => p.github === repoFullName);

	if (!project) {
		return json({ ok: true, message: `${repoFullName} not registered for indexing` });
	}

	// Respond immediately — indexing happens asynchronously
	(async () => {
		try {
			const cacheDir = resolve(REPO_CACHE_DIR, repoFullName);
			await cloneOrPull(cloneUrl, cacheDir, defaultBranch);
			spawnIndexer(cacheDir, project.graph, project.name);
		} catch (err) {
			console.error(`[webhook] reindex failed for ${repoFullName}:`, err);
		}
	})();

	return json({ ok: true, message: `reindex queued for ${project.name}` });
};
