import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { env } from '$env/dynamic/private';
import { getSql } from './db.js';
import { getSection } from './settings.js';

const exec = promisify(execFile);

// Colon-separated like compose's own COMPOSE_FILE (deploys add
// docker-compose.edge.yml so in-app `up`s see the same config as the stack).
const COMPOSE_FILES = (env.COMPOSE_FILE || '/app/docker-compose.yml').split(':');

interface OptionalService {
	/** Compose profile that gates the service. */
	profile: string;
	/** Compose service name to start/stop. */
	service: string;
	/** Human label for the UI. */
	label: string;
	/** Env vars that must be set before the service can start. */
	requires: string[];
}

export const OPTIONAL_SERVICES: OptionalService[] = [
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
 * Config a service needs before it can start. DB-backed secrets (Anthropic
 * key, Discord bot token) are reported missing from settings; everything else
 * is checked against the host env.
 */
async function missingConfig(svc: OptionalService): Promise<string[]> {
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

async function compose(args: string[]): Promise<void> {
	await exec('docker', ['compose', ...COMPOSE_FILES.flatMap((f) => ['-f', f]), ...args], {
		timeout: 120_000,
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
	await compose(['--profile', svc.profile, 'up', '-d', svc.service]);
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
