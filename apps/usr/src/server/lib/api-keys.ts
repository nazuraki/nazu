import { createHash, randomBytes } from 'node:crypto';

import { getSql } from './db.js';
import type { AppGrants } from './permissions.js';
import type { Role } from './roles.js';
import { ValidationError } from './users.js';

export interface ApiKey {
	id: number;
	name: string;
	roles: Pick<Role, 'id' | 'app' | 'name'>[];
	createdAt: string;
	lastUsedAt: string | null;
}

const NAME_RE = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const TOKEN_PREFIX = 'usr_';

export function hashKeyToken(token: string): string {
	return createHash('sha256').update(token).digest('hex');
}

interface KeyRow {
	id: string;
	name: string;
	created_at: string;
	last_used_at: string | null;
	roles: { id: number; app: string; name: string }[] | null;
}

const KEY_QUERY = `
	SELECT k.id, k.name, k.created_at, k.last_used_at,
	       COALESCE(json_agg(json_build_object('id', r.id, 'app', r.app, 'name', r.name)
	                         ORDER BY r.app, r.name)
	                FILTER (WHERE r.id IS NOT NULL), '[]') AS roles
	FROM api_keys k
	LEFT JOIN api_key_roles kr ON kr.key_id = k.id
	LEFT JOIN roles r ON r.id = kr.role_id
`;

function toKey(row: KeyRow): ApiKey {
	return {
		id: Number(row.id),
		name: row.name,
		roles: row.roles ?? [],
		createdAt: row.created_at,
		lastUsedAt: row.last_used_at,
	};
}

export async function listApiKeys(): Promise<ApiKey[]> {
	const sql = getSql();
	const rows = (await sql.unsafe(`${KEY_QUERY} GROUP BY k.id ORDER BY k.name`)) as unknown as KeyRow[];
	return rows.map(toKey);
}

export async function getApiKey(id: number): Promise<ApiKey | undefined> {
	const sql = getSql();
	const rows = (await sql.unsafe(`${KEY_QUERY} WHERE k.id = $1 GROUP BY k.id`, [
		id,
	])) as unknown as KeyRow[];
	return rows[0] ? toKey(rows[0]) : undefined;
}

/** Create a key; the returned token is shown once and stored only hashed. */
export async function createApiKey(
	name: string,
	roleIds: number[],
): Promise<{ key: ApiKey; token: string }> {
	if (!NAME_RE.test(name)) {
		throw new ValidationError(`invalid key name "${name}" (lowercase letters, digits, ._-)`);
	}
	const token = TOKEN_PREFIX + randomBytes(32).toString('hex');
	const sql = getSql();
	const id = await sql.begin(async (tx) => {
		const rows = await tx<{ id: string }[]>`
			INSERT INTO api_keys (name, key_hash) VALUES (${name}, ${hashKeyToken(token)})
			ON CONFLICT (name) DO NOTHING
			RETURNING id
		`;
		if (!rows[0]) throw new ValidationError(`key "${name}" already exists`);
		const keyId = Number(rows[0].id);
		for (const roleId of roleIds) {
			await tx`INSERT INTO api_key_roles (key_id, role_id) VALUES (${keyId}, ${roleId})`;
		}
		return keyId;
	});
	return { key: (await getApiKey(id))!, token };
}

export async function deleteApiKey(id: number): Promise<boolean> {
	const sql = getSql();
	const res = await sql`DELETE FROM api_keys WHERE id = ${id}`;
	return res.count > 0;
}

/** Replace a key's role set. */
export async function setApiKeyRoles(keyId: number, roleIds: number[]): Promise<void> {
	const sql = getSql();
	await sql.begin(async (tx) => {
		await tx`DELETE FROM api_key_roles WHERE key_id = ${keyId}`;
		for (const roleId of roleIds) {
			await tx`INSERT INTO api_key_roles (key_id, role_id) VALUES (${keyId}, ${roleId})`;
		}
	});
}

/** Resolve a presented token to its key; touches last_used_at. */
export async function validateApiKeyToken(
	token: string,
): Promise<{ id: number; name: string } | null> {
	const sql = getSql();
	const rows = await sql<{ id: string; name: string }[]>`
		UPDATE api_keys SET last_used_at = now()
		WHERE key_hash = ${hashKeyToken(token)}
		RETURNING id, name
	`;
	return rows[0] ? { id: Number(rows[0].id), name: rows[0].name } : null;
}

export async function apiKeyCount(): Promise<number> {
	const sql = getSql();
	const rows = await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM api_keys`;
	return rows[0].n;
}

/** A key's effective grants, same shape as a user's (optionally one app). */
export async function keyGrants(keyId: number, app?: string): Promise<Record<string, AppGrants>> {
	const sql = getSql();
	const rows = await sql<{ app: string; role: string; permission: string | null }[]>`
		SELECT r.app, r.name AS role, rp.permission
		FROM api_key_roles kr
		JOIN roles r ON r.id = kr.role_id
		LEFT JOIN role_permissions rp ON rp.role_id = r.id
		WHERE kr.key_id = ${keyId}
		${app ? sql`AND r.app = ${app}` : sql``}
		ORDER BY r.app, r.name, rp.permission
	`;
	const apps: Record<string, AppGrants> = {};
	for (const row of rows) {
		const grants = (apps[row.app] ??= { roles: [], permissions: [] });
		if (!grants.roles.includes(row.role)) grants.roles.push(row.role);
		if (row.permission && !grants.permissions.includes(row.permission)) {
			grants.permissions.push(row.permission);
		}
	}
	return apps;
}
