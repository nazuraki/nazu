/**
 * Cross-app SSO: a short-lived signed identity JWT (`nz_id`) set on a shared
 * parent domain so sibling apps can authenticate the browser offline against
 * /.well-known/jwks.json. Off unless USR_SSO_COOKIE_DOMAIN is set — the
 * opaque `usr_session` cookie stays the source of truth and refresh path.
 */
import { hashToken } from './auth.js';
import { getSigningKey, signJwt } from './jwt.js';
import { resolvePermissions, type AppGrants } from './permissions.js';

export const SSO_COOKIE = 'nz_id';
const DEFAULT_TTL_SECONDS = 30 * 60;

export interface SsoConfig {
	/** Cookie Domain (leading dot optional); SSO is disabled when unset. */
	cookieDomain: string;
	ttlSeconds: number;
}

export interface IdentityClaims {
	iss: 'usr';
	sub: string;
	sid: string;
	iat: number;
	exp: number;
	grants: Record<string, AppGrants>;
}

/** Parse "30m" | "2h" | "900" (seconds) | "900s"; null when invalid. */
export function parseTtl(raw: string | undefined): number | null {
	if (!raw) return null;
	const m = /^(\d+)\s*([smh]?)$/.exec(raw.trim());
	if (!m) return null;
	const n = Number(m[1]);
	const mult = m[2] === 'h' ? 3600 : m[2] === 'm' ? 60 : 1;
	return n > 0 ? n * mult : null;
}

/** Config from env; null when SSO is off. */
export function ssoConfig(env: NodeJS.ProcessEnv = process.env): SsoConfig | null {
	const domain = env.USR_SSO_COOKIE_DOMAIN?.trim().toLowerCase();
	if (!domain) return null;
	return {
		cookieDomain: domain.startsWith('.') ? domain.slice(1) : domain,
		ttlSeconds: parseTtl(env.USR_SSO_TOKEN_TTL) ?? DEFAULT_TTL_SECONDS,
	};
}

/** Opaque session correlation id derived from the session token. */
export function sessionId(sessionToken: string): string {
	return hashToken(sessionToken).slice(0, 16);
}

export function buildIdentityClaims(
	email: string,
	sid: string,
	grants: Record<string, AppGrants>,
	ttlSeconds: number,
	nowMs: number = Date.now(),
): IdentityClaims {
	const iat = Math.floor(nowMs / 1000);
	return { iss: 'usr', sub: email, sid, iat, exp: iat + ttlSeconds, grants };
}

/** Cookie attributes for `nz_id`: zone-wide, HttpOnly, Secure (edge terminates TLS). */
export function ssoCookieOpts(cfg: SsoConfig): {
	domain: string;
	path: '/';
	httpOnly: true;
	secure: true;
	sameSite: 'Lax';
	maxAge: number;
} {
	return {
		domain: cfg.cookieDomain,
		path: '/',
		httpOnly: true,
		secure: true,
		sameSite: 'Lax',
		maxAge: cfg.ttlSeconds,
	};
}

/**
 * Allow-list a `?return=` target: absolute http(s) URL whose host is the cookie
 * domain or a subdomain of it. Anything else → null (caller falls back to "/").
 */
export function safeReturnUrl(raw: string | undefined | null, cfg: SsoConfig): string | null {
	if (!raw) return null;
	let url: URL;
	try {
		url = new URL(raw);
	} catch {
		return null;
	}
	if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
	if (url.username || url.password) return null;
	const host = url.hostname.toLowerCase();
	const d = cfg.cookieDomain;
	if (host !== d && !host.endsWith(`.${d}`)) return null;
	return url.toString();
}

/** Mint the identity token for a logged-in user from their current grants. */
export async function mintIdentityToken(
	email: string,
	sessionToken: string,
	cfg: SsoConfig,
): Promise<string> {
	const { apps } = await resolvePermissions(email);
	const claims = buildIdentityClaims(email, sessionId(sessionToken), apps, cfg.ttlSeconds);
	return signJwt(claims, await getSigningKey());
}
