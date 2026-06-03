import { timingSafeEqual } from 'node:crypto';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { env } from '$env/dynamic/private';

export interface User {
	id: string;
	email: string;
	name?: string;
	source: 'cf-access' | 'oauth' | 'local';
}

/** Default identity assigned to unauthenticated requests in zero-conf open mode. */
const LOCAL_USER_EMAIL = 'local@nazu.local';

/** True when CF Access edge auth is configured (gates the tunnel, not the LAN). */
export function cfAccessConfigured(): boolean {
	return Boolean(env.CF_ACCESS_TEAM_DOMAIN?.trim() && env.CF_ACCESS_AUD?.trim());
}

/** True when at least one OAuth provider is configured. */
export function oauthConfigured(): boolean {
	return Boolean(
		(env.AUTH_GITHUB_ID?.trim() && env.AUTH_GITHUB_SECRET?.trim()) ||
			(env.AUTH_GOOGLE_ID?.trim() && env.AUTH_GOOGLE_SECRET?.trim()),
	);
}

/** True when local admin user/password credentials are configured. */
export function localAuthConfigured(): boolean {
	return Boolean(env.NAZU_AUTH_USER?.trim() && env.NAZU_AUTH_PASSWORD?.trim());
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
 * admin credentials. Returns the local user on match, null otherwise.
 */
export function validateBasicAuth(request: Request): User | null {
	const user = env.NAZU_AUTH_USER?.trim();
	const pass = env.NAZU_AUTH_PASSWORD;
	if (!user || !pass) return null;

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

	if (!safeEqual(gotUser, user) || !safeEqual(gotPass, pass)) return null;

	return { id: user, email: env.NAZU_LOCAL_USER_EMAIL?.trim() || LOCAL_USER_EMAIL, source: 'local' };
}

/** The default local user for zero-conf open mode (no auth method configured). */
export function localUser(): User {
	return {
		id: 'local',
		email: env.NAZU_LOCAL_USER_EMAIL?.trim() || LOCAL_USER_EMAIL,
		source: 'local',
	};
}

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

function getCFJWKS() {
	const domain = env.CF_ACCESS_TEAM_DOMAIN;
	if (!domain) return null;
	if (!jwks) {
		jwks = createRemoteJWKSet(new URL(`https://${domain}/cdn-cgi/access/certs`));
	}
	return jwks;
}

export async function validateCFToken(request: Request): Promise<User | null> {
	const domain = env.CF_ACCESS_TEAM_DOMAIN;
	const aud = env.CF_ACCESS_AUD;
	if (!domain || !aud) return null;

	const token = request.headers.get('Cf-Access-Jwt-Assertion');
	if (!token) return null;

	try {
		const keySet = getCFJWKS()!;
		const { payload } = await jwtVerify(token, keySet, {
			issuer: `https://${domain}`,
			audience: aud,
		});

		const email = payload.email as string | undefined;
		if (!email) return null;

		return {
			id: payload.sub ?? email,
			email,
			source: 'cf-access',
		};
	} catch {
		return null;
	}
}
