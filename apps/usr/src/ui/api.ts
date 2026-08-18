/** Fetch wrapper + typed client for the usr API (cookie-session authed). */

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
	const res = await fetch(path, init);
	if (!res.ok) {
		const body = await res.text();
		let message = `HTTP ${res.status}`;
		try {
			message = (JSON.parse(body) as { error?: string }).error ?? message;
		} catch {
			/* not json */
		}
		throw new Error(message);
	}
	return res.json() as Promise<T>;
}

const JSON_HEADERS = { 'content-type': 'application/json' };

// ── Auth ──────────────────────────────────────────────────────────────────────

export interface AuthStatus {
	authenticated: boolean;
	method: 'api-key' | 'session' | 'basic' | 'open' | null;
	email: string | null;
	admin: boolean;
	setupRequired: boolean;
	localAuth: boolean;
	apiKeyAuth: boolean;
	oauthProviders: string[];
}

export const fetchAuthStatus = (): Promise<AuthStatus> => api('/api/auth/status');

export interface SetupInput {
	email: string;
	name?: string;
	username: string;
	password: string;
}

export async function setup(input: SetupInput): Promise<void> {
	await api('/api/auth/setup', {
		method: 'POST',
		headers: JSON_HEADERS,
		body: JSON.stringify(input),
	});
}

export async function login(username: string, password: string): Promise<void> {
	await api('/api/auth/login', {
		method: 'POST',
		headers: JSON_HEADERS,
		body: JSON.stringify({ username, password }),
	});
}

export async function logout(): Promise<void> {
	await api('/api/auth/logout', { method: 'POST' });
}

// ── Users / profile ───────────────────────────────────────────────────────────

export interface Role {
	id: number;
	app: string;
	name: string;
	description: string | null;
	permissions: string[];
}

export interface User {
	id: number;
	email: string;
	name: string | null;
	displayName: string | null;
	avatarUrl: string | null;
	timezone: string | null;
	createdAt: string;
	updatedAt: string;
	lastLoginAt: string | null;
}

export interface UserWithRoles extends User {
	roles: Role[];
}

export interface ProfileInput {
	name?: string;
	displayName?: string;
	avatarUrl?: string;
	timezone?: string;
}

export const fetchProfile = (): Promise<UserWithRoles> => api('/api/profile');

export const saveProfile = (input: ProfileInput): Promise<User> =>
	api('/api/profile', { method: 'PATCH', headers: JSON_HEADERS, body: JSON.stringify(input) });

export const fetchUsers = (): Promise<User[]> => api('/api/users');

export const fetchUser = (id: number): Promise<UserWithRoles> => api(`/api/users/${id}`);

export const createUser = (email: string, roleIds: number[]): Promise<UserWithRoles> =>
	api('/api/users', { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify({ email, roleIds }) });

export const deleteUser = (id: number): Promise<{ ok: boolean }> =>
	api(`/api/users/${id}`, { method: 'DELETE' });

export const setUserRoles = (id: number, roleIds: number[]): Promise<Role[]> =>
	api(`/api/users/${id}/roles`, { method: 'PUT', headers: JSON_HEADERS, body: JSON.stringify({ roleIds }) });

// ── Roles ─────────────────────────────────────────────────────────────────────

export interface RoleInput {
	app: string;
	name: string;
	description?: string;
	permissions: string[];
}

export const fetchRoles = (): Promise<Role[]> => api('/api/roles');

export const createRole = (input: RoleInput): Promise<Role> =>
	api('/api/roles', { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify(input) });

export const updateRole = (id: number, input: Partial<RoleInput>): Promise<Role> =>
	api(`/api/roles/${id}`, { method: 'PATCH', headers: JSON_HEADERS, body: JSON.stringify(input) });

export const deleteRole = (id: number): Promise<{ ok: boolean }> =>
	api(`/api/roles/${id}`, { method: 'DELETE' });

// ── Settings ──────────────────────────────────────────────────────────────────

export interface OAuthSettings {
	githubId: string;
	githubSecretSet: boolean;
	googleId: string;
	googleSecretSet: boolean;
}

export const fetchOAuthSettings = (): Promise<OAuthSettings> => api('/api/settings/oauth');

export const saveOAuthSettings = (values: Record<string, string>): Promise<{ ok: boolean }> =>
	api('/api/settings/oauth', { method: 'PUT', headers: JSON_HEADERS, body: JSON.stringify(values) });

export const saveLocalAdmin = (
	username: string,
	password: string,
	email?: string,
): Promise<{ ok: boolean }> =>
	api('/api/settings/local-admin', {
		method: 'PUT',
		headers: JSON_HEADERS,
		body: JSON.stringify({ username, password, email: email || undefined }),
	});
