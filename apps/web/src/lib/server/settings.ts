import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { error } from '@sveltejs/kit';
import {
	APP_FEATURES,
	SECTIONS,
	getSectionDef,
	isSecretField,
	sectionDefaults,
	type Field,
} from '$lib/config/settings.js';
import { readRaw, writeRaw, type Config } from './settings-store.js';

// Per-process cache of resolved (defaults-merged) section configs. Single web
// container today, so a simple in-memory cache is sufficient; multi-replica
// deployments would need pub/sub invalidation (out of scope).
const _cache = new Map<string, Record<string, unknown>>();

/** Test-only: drop the in-memory section cache. */
export function __clearSettingsCache(): void {
	_cache.clear();
}

/**
 * Resolve a section's config: stored values overlaid on schema defaults.
 * Returns RAW values including secrets/hashes — for server-internal use only.
 * Never send the result to a client; use {@link listSettings} for that.
 */
export async function getSection(section: string): Promise<Config> {
	const cached = _cache.get(section);
	if (cached) return cached;

	const def = getSectionDef(section);
	if (!def) throw new Error(`unknown settings section: ${section}`);

	const stored = await readRaw(section);

	// The Auth.js signing secret is generated once and persisted, so a fresh
	// install needs no manual AUTH_SECRET.
	if (section === 'oauth' && !stored.authSecret) {
		stored.authSecret = randomBytes(32).toString('hex');
		await writeRaw(section, stored);
	}

	const merged = { ...sectionDefaults(def), ...stored };
	_cache.set(section, merged);
	return merged;
}

function coerceField(f: Field, value: unknown): unknown {
	switch (f.type) {
		case 'boolean':
			if (typeof value !== 'boolean') throw error(400, `${f.key} must be a boolean`);
			return value;
		case 'number': {
			const n = typeof value === 'number' ? value : Number(value);
			if (!Number.isFinite(n)) throw error(400, `${f.key} must be a number`);
			return n;
		}
		case 'list':
			if (!Array.isArray(value) || !value.every((v) => typeof v === 'string'))
				throw error(400, `${f.key} must be a list of strings`);
			return value;
		default: // string | secret | password
			if (typeof value !== 'string') throw error(400, `${f.key} must be a string`);
			return value;
	}
}

/**
 * Validate and persist a partial update to a section. Unknown sections/fields
 * are rejected. Secret and password fields submitted blank are left unchanged
 * (the UI never echoes them back); passwords are stored one-way hashed.
 */
export async function setSection(section: string, partial: Config): Promise<void> {
	const def = getSectionDef(section);
	if (!def) throw error(400, `unknown settings section: ${section}`);

	const next: Config = { ...(await readRaw(section)) };

	for (const [key, raw] of Object.entries(partial)) {
		const f = def.fields.find((x) => x.key === key);
		if (!f) throw error(400, `unknown field: ${section}.${key}`);
		const val = coerceField(f, raw);
		if (isSecretField(f)) {
			if (val === '') continue; // blank = leave unchanged
			next[key] = f.type === 'password' ? hashPassword(val as string) : val;
		} else {
			next[key] = val;
		}
	}

	await writeRaw(section, next);
	_cache.delete(section);
}

/**
 * All config sections (excluding `features`) with secret values masked, for
 * rendering the settings UI. Secret fields are blanked; `secretSet` reports
 * which ones currently hold a value.
 */
export async function listSettings() {
	const out = [];
	for (const def of SECTIONS) {
		if (def.key === 'features') continue;
		const cfg = await getSection(def.key);
		const values: Config = {};
		const secretSet: Record<string, boolean> = {};
		for (const f of def.fields) {
			if (isSecretField(f)) {
				secretSet[f.key] = Boolean(cfg[f.key]);
				values[f.key] = '';
			} else {
				values[f.key] = cfg[f.key] ?? '';
			}
		}
		out.push({
			key: def.key,
			label: def.label,
			description: def.description,
			fields: def.fields.map(({ key, label, type, help }) => ({ key, label, type, help })),
			values,
			secretSet,
		});
	}
	return out;
}

// ── Feature gating ──────────────────────────────────────────────────────────

export async function isFeatureEnabled(key: string): Promise<boolean> {
	const cfg = await getSection('features');
	const f = APP_FEATURES.find((x) => x.key === key);
	return Boolean(cfg[key] ?? f?.defaultEnabled ?? true);
}

/** Throw a 404 when the named feature is disabled (for use in load functions). */
export async function requireFeature(key: string): Promise<void> {
	if (!(await isFeatureEnabled(key))) throw error(404, 'Not found');
}

export async function featureStates() {
	const cfg = await getSection('features');
	return APP_FEATURES.map((f) => ({
		key: f.key,
		label: f.label,
		description: f.description,
		href: f.href,
		enabled: Boolean(cfg[f.key] ?? f.defaultEnabled),
	}));
}

// ── Password hashing (scrypt, no external dependency) ────────────────────────

export function hashPassword(pw: string): string {
	const salt = randomBytes(16);
	const hash = scryptSync(pw, salt, 64);
	return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

export function verifyPassword(pw: string, stored: string): boolean {
	const [scheme, saltHex, hashHex] = stored.split('$');
	if (scheme !== 'scrypt' || !saltHex || !hashHex) return false;
	const hash = Buffer.from(hashHex, 'hex');
	const test = scryptSync(pw, Buffer.from(saltHex, 'hex'), hash.length);
	return hash.length === test.length && timingSafeEqual(hash, test);
}
