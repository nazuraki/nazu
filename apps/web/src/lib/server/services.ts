import { execFile } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { promisify } from 'node:util';
import { env } from '$env/dynamic/private';
import { getSql } from './db.js';
import { getSection } from './settings.js';

const exec = promisify(execFile);

const COMPOSE_FILE = env.COMPOSE_FILE || '/app/docker-compose.yml';
// Mount point of the caddy_config volume shared with the caddy container.
const CADDY_CONFIG_DIR = env.CADDY_CONFIG_DIR || '/config';

interface OptionalService {
	/** Compose profile that gates the service. */
	profile: string;
	/** Compose service name to start/stop. */
	service: string;
	/** Human label for the UI. */
	label: string;
	/** Env vars that must be set before the service can start. */
	requires: string[];
	/** Optional hook to materialize config files before `up`. */
	prepare?: () => Promise<void>;
}

// The plain-HTTP :2020 listener serves Prometheus metrics (request rate/latency)
// for the backplane's observability stack (#75), which scrapes it via the host
// port published in docker-compose.yml. The `servers metrics` global enables
// per-request metrics collection.
const CADDYFILE = `{
	servers {
		metrics
	}
}

{$NAZU_HOSTNAME} {
	tls {$NAZU_TLS_CERT} {$NAZU_TLS_KEY}
	reverse_proxy web:3000
}

http://:2020 {
	metrics /metrics
}
`;

export const OPTIONAL_SERVICES: OptionalService[] = [
	{
		profile: 'tunnel',
		service: 'cloudflared',
		label: 'Cloudflare Tunnel',
		requires: ['CF_TUNNEL_TOKEN'],
	},
	{
		profile: 'tls',
		service: 'caddy',
		label: 'TLS (Caddy)',
		requires: ['NAZU_HOSTNAME', 'NAZU_TLS_CERT', 'NAZU_TLS_KEY'],
		async prepare() {
			const path = resolve(CADDY_CONFIG_DIR, 'Caddyfile');
			await mkdir(dirname(path), { recursive: true });
			await writeFile(path, CADDYFILE, 'utf8');
		},
	},
	{
		// Graphiti temporal-graph recall sidecar (#53). Needs the Anthropic key
		// (DB-backed) for entity extraction; checked from settings in missingConfig.
		profile: 'graph',
		service: 'graphiti',
		label: 'Graph recall (Graphiti)',
		requires: [],
	},
	{
		// Discord ingest bot (#34). Needs a bot token (DB-backed, in the `discord`
		// settings section); checked from settings in missingConfig.
		profile: 'discord',
		service: 'discord',
		label: 'Discord ingest bot',
		requires: [],
	},
];

function find(profile: string): OptionalService {
	const svc = OPTIONAL_SERVICES.find((s) => s.profile === profile);
	if (!svc) throw new Error(`unknown service profile: ${profile}`);
	return svc;
}

/**
 * Config a service needs before it can start. The Cloudflare Tunnel token now
 * lives in DB settings (injected into the compose subprocess by {@link composeEnv}),
 * so it's reported missing from there rather than from the host env.
 */
async function missingConfig(svc: OptionalService): Promise<string[]> {
	if (svc.profile === 'tunnel') {
		const o = await getSection('oauth');
		return (o.cfTunnelToken as string)?.trim() ? [] : ['CF_TUNNEL_TOKEN'];
	}
	if (svc.profile === 'graph') {
		const ai = await getSection('ai');
		return (ai.anthropicApiKey as string)?.trim() ? [] : ['Anthropic API key'];
	}
	if (svc.profile === 'discord') {
		const d = await getSection('discord');
		return (d.botToken as string)?.trim() ? [] : ['Discord bot token'];
	}
	return svc.requires.filter((k) => !env[k]?.trim());
}

/** Extra env injected into the compose subprocess for a service. */
async function composeEnv(svc: OptionalService): Promise<Record<string, string>> {
	if (svc.profile === 'tunnel') {
		const o = await getSection('oauth');
		return { CF_TUNNEL_TOKEN: (o.cfTunnelToken as string)?.trim() ?? '' };
	}
	return {};
}

async function compose(args: string[], extraEnv: Record<string, string> = {}): Promise<void> {
	await exec('docker', ['compose', '-f', COMPOSE_FILE, ...args], {
		timeout: 120_000,
		env: { ...process.env, ...extraEnv },
	});
}

export interface ServiceState {
	profile: string;
	service: string;
	label: string;
	enabled: boolean; // persisted intent
	running: boolean; // live container state
	missingEnv: string[];
}

/** Reconcile persisted intent against live container state. */
export async function listServiceStates(running: Set<string>): Promise<ServiceState[]> {
	const sql = getSql();
	const rows = await sql<{ profile: string; enabled: boolean }[]>`
		SELECT profile, enabled FROM service_config
	`;
	const intent = new Map(rows.map((r) => [r.profile, r.enabled]));

	return Promise.all(
		OPTIONAL_SERVICES.map(async (svc) => ({
			profile: svc.profile,
			service: svc.service,
			label: svc.label,
			enabled: intent.get(svc.profile) ?? false,
			running: running.has(svc.service),
			missingEnv: await missingConfig(svc),
		})),
	);
}

/** Start an optional service via its compose profile and persist the intent. */
export async function enableService(profile: string): Promise<void> {
	const svc = find(profile);
	const missing = await missingConfig(svc);
	if (missing.length) {
		throw new Error(`missing required config: ${missing.join(', ')}`);
	}
	await svc.prepare?.();
	await compose(['--profile', svc.profile, 'up', '-d', svc.service], await composeEnv(svc));
	await persist(svc.profile, true);
}

/**
 * Stop an optional service. Uses `stop` (not `rm`) so the container's
 * `restart: unless-stopped` policy keeps it down across reboots only while
 * disabled, matching the UI toggle's intent.
 */
export async function disableService(profile: string): Promise<void> {
	const svc = find(profile);
	await compose(['stop', svc.service]);
	await persist(svc.profile, false);
}

async function persist(profile: string, enabled: boolean): Promise<void> {
	const sql = getSql();
	await sql`
		INSERT INTO service_config (profile, enabled, updated_at)
		VALUES (${profile}, ${enabled}, now())
		ON CONFLICT (profile)
		DO UPDATE SET enabled = ${enabled}, updated_at = now()
	`;
}
