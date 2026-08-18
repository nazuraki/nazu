import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

import { getSql } from './db.js';
import { hasPermission } from './permissions.js';
import { getSection, putSection } from './settings.js';
import { getUser, touchLastLogin, type User } from './users.js';

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

export async function setLocalCredentials(username: string, password: string): Promise<void> {
	await putSection('auth', { localUser: username, localPassword: hashPassword(password) });
}

export async function verifyLocalCredentials(
	username: string,
	password: string,
): Promise<AuthUser | null> {
	const auth = await getSection('auth');
	if (!auth.localUser || !auth.localPassword) return null;
	if (!safeEqual(username, auth.localUser)) return null;
	if (!verifyPassword(password, auth.localPassword)) return null;
	return { id: auth.localUser, email: null, userId: null, admin: true, method: 'basic' };
}

export function validateBasicHeader(header: string | undefined): [string, string] | null {
	if (!header?.startsWith('Basic ')) return null;
	const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
	const idx = decoded.indexOf(':');
	if (idx < 0) return null;
	return [decoded.slice(0, idx), decoded.slice(idx + 1)];
}

// ── Sessions (browser cookies; token stored hashed) ───────────────────────────

/** Session for a real user (userId) or the local admin account (username). */
export async function createSession(who: { userId: number } | { username: string }): Promise<string> {
	const sql = getSql();
	const token = randomBytes(32).toString('hex');
	const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
	const userId = 'userId' in who ? who.userId : null;
	const username = 'username' in who ? who.username : null;
	await sql`
		INSERT INTO sessions (token_hash, user_id, username, expires_at)
		VALUES (${hashToken(token)}, ${userId}, ${username}, ${expiresAt})
	`;
	if (userId !== null) await touchLastLogin(userId);
	return token;
}

export async function validateSession(token: string | undefined): Promise<AuthUser | null> {
	if (!token) return null;
	const sql = getSql();
	const rows = await sql<{ user_id: string | null; username: string | null; expires_at: string }[]>`
		SELECT user_id, username, expires_at FROM sessions WHERE token_hash = ${hashToken(token)}
	`;
	if (!rows[0] || new Date(rows[0].expires_at) < new Date()) return null;
	if (rows[0].user_id === null) {
		// Local admin session — no users row, always admin.
		return { id: rows[0].username ?? 'admin', email: null, userId: null, admin: true, method: 'session' };
	}
	const user = await getUser(Number(rows[0].user_id));
	if (!user) return null;
	return {
		id: user.email,
		email: user.email,
		userId: user.id,
		admin: await hasPermission(user.email, 'usr', 'admin'),
		method: 'session',
	};
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
