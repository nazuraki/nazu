import { timingSafeEqual } from 'node:crypto';

import type { Identity, SsoVerifier } from './sso.js';

export type AuthMethod = 'api-key' | 'sso' | 'open';

export interface AuthResult {
	username: string;
	method: AuthMethod;
	/** Present for `sso`: the verified usr identity and its backplane grants. */
	identity?: Identity;
}

function safeEqual(a: string, b: string): boolean {
	const ab = Buffer.from(a);
	const bb = Buffer.from(b);
	if (ab.length !== bb.length) return false;
	return timingSafeEqual(ab, bb);
}

/**
 * Auth ladder: static bearer key (agents/MCP) → usr SSO cookie (browsers) →
 * open. Zero-conf: when neither is configured every request passes as `open`.
 * Browser identity and roles live in usr; the backplane keeps no accounts.
 */
export class AuthService {
	constructor(
		private apiKey?: string,
		readonly sso?: SsoVerifier,
	) {}

	apiKeyConfigured(): boolean {
		return Boolean(this.apiKey);
	}

	ssoConfigured(): boolean {
		return Boolean(this.sso);
	}

	/** True when any auth method gates the API. */
	required(): boolean {
		return this.apiKeyConfigured() || this.ssoConfigured();
	}

	/**
	 * Resolve a request: bearer key → `nz_id` cookie with a backplane grant →
	 * open (only when nothing is configured). Null = reject.
	 */
	async authenticate(
		authorization: string | undefined,
		ssoToken: string | undefined,
	): Promise<AuthResult | null> {
		if (this.apiKey && authorization?.startsWith('Bearer ')) {
			if (safeEqual(authorization.slice(7), this.apiKey)) {
				return { username: 'api-key', method: 'api-key' };
			}
		}
		if (this.sso && ssoToken) {
			const identity = await this.sso.verify(ssoToken);
			if (identity && this.sso.authorized(identity)) {
				return { username: identity.email, method: 'sso', identity };
			}
		}
		if (!this.required()) return { username: 'local', method: 'open' };
		return null;
	}
}
