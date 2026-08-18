import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

import { getSql } from './db.js';
import { hasPermission } from './permissions.js';
import { listRoles, setUserRoles } from './roles.js';
import { getSection, putSection } from './settings.js';
import { createUser, getUser, getUserByEmail, touchLastLogin, ValidationError, type User } from './users.js';

export type AuthMethod = 'api-key' | 'session' | 'basic' | 'open';

export interface AuthUser {
	/** Email for real users; the configured username for the local admin. */
	id: string;
	email: string | null;
	/** Row id when the identity maps to a users row (OAuth/session logins). */
	userId: number | null;
	admin: boolean;
	method: AuthMethod;
}

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

// ── Password hashing (scrypt, no external dependency; same format as siblings) ─

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

function safeEqual(a: string, b: string): boolean {
	const ab = Buffer.from(a);
	const bb = Buffer.from(b);
	if (ab.length !== bb.length) return false;
	return timingSafeEqual(ab, bb);
}

export function hashToken(token: string): string {
	return createHash('sha256').update(token).digest('hex');
}

// ── API key (static header for machine clients, e.g. other apps) ──────────────

export function validateApiKey(header: string | undefined, configured: string): AuthUser | null {
	if (!configured || !header) return null;
	if (!safeEqual(header, configured)) return null;
	return { id: 'api', email: null, userId: null, admin: true, method: 'api-key' };
}

// ── Local admin (username/password in app_settings; Basic or session) ─────────

export async function localAuthConfigured(): Promise<boolean> {
	const auth = await getSection('auth');
	return Boolean(auth.localUser && auth.localPassword);
}

/** Store the break-glass credentials, linked to an existing user by email. */
export async function setLocalCredentials(
	username: string,
	password: string,
	email: string,
): Promise<void> {
	const user = await getUserByEmail(email);
	if (!user) throw new ValidationError(`no user with email "${email}" to link the credentials to`);
	await putSection('auth', {
		localUser: username,
		localPassword: hashPassword(password),
		localEmail: user.email,
	});
}

/** Local credentials are break-glass admin, backed by the linked users row. */
export async function verifyLocalCredentials(
	username: string,
	password: string,
): Promise<AuthUser | null> {
	const auth = await getSection('auth');
	if (!auth.localUser || !auth.localPassword || !auth.localEmail) return null;
	if (!safeEqual(username, auth.localUser)) return null;
	if (!verifyPassword(password, auth.localPassword)) return null;
	const user = await getUserByEmail(auth.localEmail);
	if (!user) return null;
	return { id: auth.localUser, email: user.email, userId: user.id, admin: true, method: 'basic' };
}

/** True when this email holds the local credentials (deletion is refused). */
export async function isLocalCredentialHolder(email: string): Promise<boolean> {
	const auth = await getSection('auth');
	return Boolean(auth.localEmail) && auth.localEmail === email;
}

// ── First-run setup (zero-conf welcome) ────────────────────────────────────────

/** True on a fresh install: no local credentials and an empty user roster. */
export async function setupRequired(): Promise<boolean> {
	if (await localAuthConfigured()) return false;
	const sql = getSql();
	const rows = await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM users`;
	return rows[0].n === 0;
}

export interface SetupInput {
	email: string;
	name?: string;
	username: string;
	password: string;
}

/**
 * Create the initial admin: a real users row holding the seeded usr/admin
 * role, with the local credentials linked to it (localEmail).
 */
export async function completeSetup(input: SetupInput): Promise<number> {
	if (!(await setupRequired())) throw new ValidationError('setup has already been completed');
	const user = await createUser(input.email, { name: input.name ?? null });
	const adminRole = (await listRoles('usr')).find((r) => r.name === 'admin');
	if (adminRole) await setUserRoles(user.id, [adminRole.id]);
	await setLocalCredentials(input.username, input.password, user.email);
	return user.id;
}

export function validateBasicHeader(header: string | undefined): [string, string] | null {
	if (!header?.startsWith('Basic ')) return null;
	const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
	const idx = decoded.indexOf(':');
	if (idx < 0) return null;
	return [decoded.slice(0, idx), decoded.slice(idx + 1)];
}

// ── Sessions (browser cookies; token stored hashed) ───────────────────────────

export async function createSession(userId: number): Promise<string> {
	const sql = getSql();
	const token = randomBytes(32).toString('hex');
	const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
	await sql`
		INSERT INTO sessions (token_hash, user_id, expires_at)
		VALUES (${hashToken(token)}, ${userId}, ${expiresAt})
	`;
	await touchLastLogin(userId);
	return token;
}

export async function validateSession(token: string | undefined): Promise<AuthUser | null> {
	if (!token) return null;
	const sql = getSql();
	const rows = await sql<{ user_id: string; expires_at: string }[]>`
		SELECT user_id, expires_at FROM sessions WHERE token_hash = ${hashToken(token)}
	`;
	if (!rows[0] || new Date(rows[0].expires_at) < new Date()) return null;
	const user = await getUser(Number(rows[0].user_id));
	if (!user) return null;
	// The credential holder is admin regardless of roles (break-glass parity
	// with Basic auth); everyone else needs the usr/admin permission.
	const admin =
		(await isLocalCredentialHolder(user.email)) || (await hasPermission(user.email, 'usr', 'admin'));
	return { id: user.email, email: user.email, userId: user.id, admin, method: 'session' };
}

export async function deleteSession(token: string | undefined): Promise<void> {
	if (!token) return;
	const sql = getSql();
	await sql`DELETE FROM sessions WHERE token_hash = ${hashToken(token)}`;
}

// ── Zero-conf open mode ────────────────────────────────────────────────────────

/** With no API key, no local admin and no OAuth configured, requests are open. */
export async function openMode(apiKey: string): Promise<boolean> {
	if (apiKey) return false;
	if (await localAuthConfigured()) return false;
	const o = await getSection('oauth');
	return !(o.githubId && o.githubSecret) && !(o.googleId && o.googleSecret);
}

export function openUser(): AuthUser {
	return { id: 'local', email: null, userId: null, admin: true, method: 'open' };
}

export type { User };
