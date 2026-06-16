import { timingSafeEqual } from 'node:crypto';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { env } from '$env/dynamic/private';
import { getSection, verifyPassword } from '$lib/server/settings.js';

export interface User {
	id: string;
	email: string;
	name?: string;
	source: 'cf-access' | 'oauth' | 'local' | 'api-key';
}

/** Default identity assigned to unauthenticated requests in zero-conf open mode. */
const LOCAL_USER_EMAIL = 'local@nazu.local';

/** True when CF Access edge auth is configured (gates the tunnel, not the LAN). */
export async function cfAccessConfigured(): Promise<boolean> {
	const o = await getSection('oauth');
	return Boolean((o.cfAccessTeamDomain as string)?.trim() && (o.cfAccessAud as string)?.trim());
}

/** True when at least one OAuth provider is configured. */
export async function oauthConfigured(): Promise<boolean> {
	const o = await getSection('oauth');
	return Boolean(
		((o.githubId as string)?.trim() && (o.githubSecret as string)?.trim()) ||
			((o.googleId as string)?.trim() && (o.googleSecret as string)?.trim()),
	);
}

/** True when a local admin username + password are configured. */
export async function localAuthConfigured(): Promise<boolean> {
	const a = await getSection('auth');
	return Boolean((a.localUser as string)?.trim() && (a.localPassword as string)?.trim());
}

function safeEqual(a: string, b: string): boolean {
	const ab = Buffer.from(a);
	const bb = Buffer.from(b);
	// timingSafeEqual requires equal-length buffers; length mismatch is a miss.
	if (ab.length !== bb.length) return false;
	return timingSafeEqual(ab, bb);
}

/**
 * Validate an HTTP Basic Authorization header against the configured local
 * admin credentials (username plain, password scrypt-hashed). Returns the local
 * user on match, null otherwise.
 */
export async function validateBasicAuth(request: Request): Promise<User | null> {
	const a = await getSection('auth');
	const user = (a.localUser as string)?.trim();
	const passHash = a.localPassword as string;
	if (!user || !passHash) return null;

	const header = request.headers.get('Authorization');
	if (!header?.startsWith('Basic ')) return null;

	let decoded: string;
	try {
		decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
	} catch {
		return null;
	}
	const sep = decoded.indexOf(':');
	if (sep < 0) return null;
	const gotUser = decoded.slice(0, sep);
	const gotPass = decoded.slice(sep + 1);

	if (!safeEqual(gotUser, user) || !verifyPassword(gotPass, passHash)) return null;

	return { id: user, email: localEmail(), source: 'local' };
}

function localEmail(): string {
	return env.NAZU_LOCAL_USER_EMAIL?.trim() || LOCAL_USER_EMAIL;
}

/** The default local user for zero-conf open mode (no auth method configured). */
export function localUser(): User {
	return { id: 'local', email: localEmail(), source: 'local' };
}

// JWKS sets are cached per team domain (the domain now comes from DB config).
const jwksByDomain = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function getCFJWKS(domain: string) {
	let set = jwksByDomain.get(domain);
	if (!set) {
		set = createRemoteJWKSet(new URL(`https://${domain}/cdn-cgi/access/certs`));
		jwksByDomain.set(domain, set);
	}
	return set;
}

export async function validateCFToken(request: Request): Promise<User | null> {
	const o = await getSection('oauth');
	const domain = (o.cfAccessTeamDomain as string)?.trim();
	const aud = (o.cfAccessAud as string)?.trim();
	if (!domain || !aud) return null;

	const token = request.headers.get('Cf-Access-Jwt-Assertion');
	if (!token) return null;

	try {
		const { payload } = await jwtVerify(token, getCFJWKS(domain), {
			issuer: `https://${domain}`,
			audience: aud,
		});

		const email = payload.email as string | undefined;
		if (!email) return null;

		return { id: payload.sub ?? email, email, source: 'cf-access' };
	} catch {
		return null;
	}
}
