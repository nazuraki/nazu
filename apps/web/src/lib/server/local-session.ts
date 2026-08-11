import { createHmac, timingSafeEqual } from 'node:crypto';

import { localEmail, type User } from '$lib/auth.js';
import { getSection } from '$lib/server/settings.js';

/**
 * Signed session tokens for form-based local-admin login. The token is a
 * stateless HMAC over `{username, expiry}` — no session table. The signing key
 * mixes the auto-generated auth secret with the stored password hash, so
 * changing the password (or clearing local auth) invalidates all sessions.
 */

export const LOCAL_SESSION_COOKIE = 'nazu_session';
export const LOCAL_SESSION_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days

function b64url(buf: Buffer): string {
	return buf.toString('base64url');
}

function mac(key: string, payload: string): Buffer {
	return createHmac('sha256', key).update(payload).digest();
}

/** Pure token mint: `<base64url payload>.<base64url hmac>`. */
export function signSessionToken(key: string, username: string, expiresAt: number): string {
	const payload = b64url(Buffer.from(JSON.stringify({ u: username, exp: expiresAt })));
	return `${payload}.${b64url(mac(key, payload))}`;
}

/** Pure token check: returns the username, or null on any mismatch/expiry. */
export function verifySessionToken(key: string, token: string, now: number): string | null {
	const dot = token.lastIndexOf('.');
	if (dot < 0) return null;
	const payload = token.slice(0, dot);

	const expected = mac(key, payload);
	let got: Buffer;
	try {
		got = Buffer.from(token.slice(dot + 1), 'base64url');
	} catch {
		return null;
	}
	if (got.length !== expected.length || !timingSafeEqual(got, expected)) return null;

	try {
		const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
		if (typeof parsed.u !== 'string' || typeof parsed.exp !== 'number') return null;
		if (parsed.exp <= now) return null;
		return parsed.u;
	} catch {
		return null;
	}
}

/** Signing key from config; null unless local auth is fully configured. */
async function signingKey(): Promise<string | null> {
	const [o, a] = await Promise.all([getSection('oauth'), getSection('auth')]);
	const secret = (o.authSecret as string) ?? '';
	const passHash = (a.localPassword as string) ?? '';
	if (!secret || !passHash) return null;
	return `${secret}:${passHash}`;
}

/** Mint a session token for a just-authenticated local user. */
export async function issueLocalSession(username: string): Promise<string | null> {
	const key = await signingKey();
	if (!key) return null;
	return signSessionToken(key, username, Math.floor(Date.now() / 1000) + LOCAL_SESSION_TTL_SECONDS);
}

/** Validate a session cookie value; the username must still match config. */
export async function validateLocalSession(token: string | undefined): Promise<User | null> {
	if (!token) return null;
	const key = await signingKey();
	if (!key) return null;

	const username = verifySessionToken(key, token, Math.floor(Date.now() / 1000));
	if (!username) return null;

	const a = await getSection('auth');
	if (username !== (a.localUser as string)?.trim()) return null;

	return { id: username, email: localEmail(), source: 'local' };
}
