import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

import type { Registry } from './registry.js';

export type AuthMethod = 'api-key' | 'session' | 'basic' | 'open';

export interface AuthResult {
	username: string;
	method: AuthMethod;
}

const USER_KEY = 'auth.localUser';
const PASS_KEY = 'auth.localPassword';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

// ── Password hashing (scrypt, no external dependency; same format as nazu web) ─

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

function hashToken(token: string): string {
	return createHash('sha256').update(token).digest('hex');
}

/**
 * Local admin auth: credentials + browser sessions in the registry DB, plus the
 * static bearer key from the environment. Zero-conf: when neither is configured
 * every request is allowed through as `open`.
 */
export class AuthService {
	constructor(
		private registry: Registry,
		private apiKey?: string,
	) {}

	apiKeyConfigured(): boolean {
		return Boolean(this.apiKey);
	}

	localConfigured(): boolean {
		return Boolean(this.registry.getSetting(USER_KEY) && this.registry.getSetting(PASS_KEY));
	}

	/** True when any auth method gates the API. */
	required(): boolean {
		return this.apiKeyConfigured() || this.localConfigured();
	}

	/** Set (or replace) the admin account and revoke all existing sessions. */
	setAccount(username: string, password: string): void {
		this.registry.setSetting(USER_KEY, username);
		this.registry.setSetting(PASS_KEY, hashPassword(password));
		this.registry.deleteAllSessions();
	}

	/** Remove the admin account (back to open mode) and revoke all sessions. */
	clearAccount(): void {
		this.registry.deleteSetting(USER_KEY);
		this.registry.deleteSetting(PASS_KEY);
		this.registry.deleteAllSessions();
	}

	verifyCredentials(username: string, password: string): boolean {
		const user = this.registry.getSetting(USER_KEY);
		const passHash = this.registry.getSetting(PASS_KEY);
		if (!user || !passHash) return false;
		return safeEqual(username, user) && verifyPassword(password, passHash);
	}

	/** Mint a session token for a logged-in user. Only the hash is stored. */
	createSession(username: string): { token: string; expiresAt: Date } {
		this.registry.deleteExpiredSessions();
		const token = randomBytes(32).toString('base64url');
		const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
		this.registry.insertSession(hashToken(token), username, expiresAt.toISOString());
		return { token, expiresAt };
	}

	validateSessionToken(token: string): string | null {
		const session = this.registry.getSession(hashToken(token));
		if (!session) return null;
		if (new Date(session.expiresAt).getTime() < Date.now()) {
			this.registry.deleteSession(hashToken(token));
			return null;
		}
		return session.username;
	}

	revokeSession(token: string): void {
		this.registry.deleteSession(hashToken(token));
	}

	/**
	 * Resolve a request against the auth ladder: bearer key → session cookie →
	 * Basic header → open (only when nothing is configured). Null = reject.
	 */
	authenticate(authorization: string | undefined, sessionToken: string | undefined): AuthResult | null {
		if (this.apiKey && authorization === `Bearer ${this.apiKey}`) {
			return { username: 'api-key', method: 'api-key' };
		}
		if (sessionToken) {
			const username = this.validateSessionToken(sessionToken);
			if (username) return { username, method: 'session' };
		}
		if (this.localConfigured() && authorization?.startsWith('Basic ')) {
			const decoded = decodeBasic(authorization);
			if (decoded && this.verifyCredentials(decoded.username, decoded.password)) {
				return { username: decoded.username, method: 'basic' };
			}
		}
		if (!this.required()) return { username: 'local', method: 'open' };
		return null;
	}
}

function decodeBasic(header: string): { username: string; password: string } | null {
	let decoded: string;
	try {
		decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
	} catch {
		return null;
	}
	const sep = decoded.indexOf(':');
	if (sep < 0) return null;
	return { username: decoded.slice(0, sep), password: decoded.slice(sep + 1) };
}
