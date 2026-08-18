import { keyGrants } from './api-keys.js';
import type { AuthUser } from './auth.js';
import { getSql } from './db.js';

export interface AppGrants {
	roles: string[];
	permissions: string[];
}

export interface PermissionsResult {
	email: string;
	exists: boolean;
	/** Grants keyed by app; when a single app was requested only that key is present. */
	apps: Record<string, AppGrants>;
}

interface GrantRow {
	app: string;
	role: string;
	permission: string | null;
}

/**
 * Resolve a user's effective grants — the hot path other apps call.
 * Unknown emails resolve to exists:false with no grants (not an error).
 */
export async function resolvePermissions(email: string, app?: string): Promise<PermissionsResult> {
	const sql = getSql();
	const normalized = email.trim().toLowerCase();

	const users = await sql<{ id: string }[]>`SELECT id FROM users WHERE email = ${normalized}`;
	if (!users[0]) return { email: normalized, exists: false, apps: {} };
	const userId = Number(users[0].id);

	const rows = await sql<GrantRow[]>`
		SELECT r.app, r.name AS role, rp.permission
		FROM user_roles ur
		JOIN roles r ON r.id = ur.role_id
		LEFT JOIN role_permissions rp ON rp.role_id = r.id
		WHERE ur.user_id = ${userId}
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
	return { email: normalized, exists: true, apps };
}

/** True when the user holds the given permission in the given app. */
export async function hasPermission(
	email: string,
	app: string,
	permission: string,
): Promise<boolean> {
	const result = await resolvePermissions(email, app);
	return result.apps[app]?.permissions.includes(permission) ?? false;
}

/** usr's own grants for an identity; root identities hold the umbrella. */
export async function usrPermissions(user: AuthUser | null): Promise<string[]> {
	if (!user) return [];
	if (user.root) return ['admin'];
	if (user.keyId !== null) {
		return (await keyGrants(user.keyId, 'usr'))['usr']?.permissions ?? [];
	}
	if (!user.email) return [];
	return (await resolvePermissions(user.email, 'usr')).apps['usr']?.permissions ?? [];
}

/**
 * Authorization gate for usr's own API: root identities pass; users need the
 * specific permission — or `admin`, the grantable umbrella — in the `usr` app.
 */
export async function can(user: AuthUser | null, permission: string): Promise<boolean> {
	const grants = await usrPermissions(user);
	return grants.includes(permission) || grants.includes('admin');
}
