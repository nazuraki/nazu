import { createPublicKey, createVerify, type KeyObject } from 'node:crypto';

/**
 * Verifier for usr's cross-app SSO cookie (`nz_id`): a short-lived ES256 JWT
 * set on the shared parent domain. Verified offline against usr's JWKS
 * (cached; refetched on an unknown `kid`), authorized from `grants[<app>]`.
 * See apps/usr/docs/sso-verifier.md. node:crypto only — no dependencies.
 */

export const SSO_COOKIE = 'nz_id';
const JWKS_TTL_MS = 5 * 60 * 1000;

export interface SsoConfig {
	/** Public base URL of usr (browser redirects + JWKS fetch), no trailing slash. */
	usrUrl: string;
	/** The app key whose grants authorize access. */
	app: string;
}

export interface Identity {
	email: string;
	roles: string[];
	permissions: string[];
}

interface Jwk {
	kid: string;
	kty: string;
	crv?: string;
	x?: string;
	y?: string;
}

interface CachedKey {
	kid: string;
	key: KeyObject;
}

/** Config from env; null when SSO is off (BACKPLANE_USR_URL unset). */
export function ssoConfig(env: NodeJS.ProcessEnv = process.env): SsoConfig | null {
	const usrUrl = env.BACKPLANE_USR_URL?.trim().replace(/\/+$/, '');
	if (!usrUrl) return null;
	return { usrUrl, app: env.BACKPLANE_USR_APP?.trim() || 'backplane' };
}

export class SsoVerifier {
	private keys: CachedKey[] = [];
	private fetchedAt = 0;

	constructor(
		readonly config: SsoConfig,
		private readonly fetchImpl: typeof fetch = fetch,
		private readonly now: () => number = Date.now,
	) {}

	/** usr endpoint that re-mints `nz_id` (or shows login) and returns the browser. */
	refreshUrl(returnTo: string): string {
		return `${this.config.usrUrl}/api/auth/sso/refresh?return=${encodeURIComponent(returnTo)}`;
	}

	/**
	 * Verify the cookie and return the identity plus its grants for our app.
	 * Null on any failure (missing, malformed, bad signature, wrong issuer,
	 * expired, JWKS unreachable). Never throws.
	 */
	async verify(token: string | undefined): Promise<Identity | null> {
		if (!token) return null;
		const parts = token.split('.');
		if (parts.length !== 3) return null;
		const [h, p, s] = parts;
		let header: { alg?: string; kid?: string };
		let claims: {
			iss?: string;
			sub?: string;
			exp?: number;
			grants?: Record<string, { roles?: string[]; permissions?: string[] }>;
		};
		try {
			header = JSON.parse(Buffer.from(h, 'base64url').toString());
			claims = JSON.parse(Buffer.from(p, 'base64url').toString());
		} catch {
			return null;
		}
		if (header.alg !== 'ES256' || !header.kid) return null;

		const key = await this.keyFor(header.kid);
		if (!key) return null;
		const verifier = createVerify('SHA256');
		verifier.update(`${h}.${p}`);
		try {
			if (!verifier.verify({ key, dsaEncoding: 'ieee-p1363' }, Buffer.from(s, 'base64url'))) return null;
		} catch {
			return null;
		}

		if (claims.iss !== 'usr' || typeof claims.sub !== 'string') return null;
		if (typeof claims.exp !== 'number' || claims.exp * 1000 <= this.now()) return null;

		const grants = claims.grants?.[this.config.app];
		return {
			email: claims.sub,
			roles: grants?.roles ?? [],
			permissions: grants?.permissions ?? [],
		};
	}

	/** True when the identity holds any grant for our app (absent key = no access). */
	authorized(identity: Identity): boolean {
		return identity.roles.length > 0 || identity.permissions.length > 0;
	}

	private async keyFor(kid: string): Promise<KeyObject | null> {
		const stale = this.now() - this.fetchedAt > JWKS_TTL_MS;
		let hit = stale ? undefined : this.keys.find((k) => k.kid === kid);
		if (!hit) {
			await this.refreshKeys();
			hit = this.keys.find((k) => k.kid === kid);
		}
		return hit?.key ?? null;
	}

	private async refreshKeys(): Promise<void> {
		try {
			const res = await this.fetchImpl(`${this.config.usrUrl}/.well-known/jwks.json`);
			if (!res.ok) return;
			const body = (await res.json()) as { keys?: Jwk[] };
			const next: CachedKey[] = [];
			for (const jwk of body.keys ?? []) {
				if (jwk.kty !== 'EC' || !jwk.kid) continue;
				try {
					next.push({ kid: jwk.kid, key: createPublicKey({ key: jwk, format: 'jwk' }) });
				} catch {
					/* skip malformed key */
				}
			}
			this.keys = next;
			this.fetchedAt = this.now();
		} catch (err) {
			console.error('[sso] jwks fetch failed:', err instanceof Error ? err.message : err);
		}
	}
}
