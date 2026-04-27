import { createRemoteJWKSet, jwtVerify } from 'jose';
import { env } from '$env/dynamic/private';

export interface User {
	id: string;
	email: string;
	name?: string;
	source: 'cf-access' | 'oauth';
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
