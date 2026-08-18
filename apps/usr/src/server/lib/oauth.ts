import { getSection } from './settings.js';

export interface OAuthProvider {
	name: 'github' | 'google';
	authorizeUrl: string;
	tokenUrl: string;
	scope: string;
	clientId: string;
	clientSecret: string;
}

export class OAuthError extends Error {}

/** Providers with credentials configured in app_settings (section `oauth`). */
export async function configuredProviders(): Promise<OAuthProvider[]> {
	const o = await getSection('oauth');
	const providers: OAuthProvider[] = [];
	if (o.githubId && o.githubSecret) {
		providers.push({
			name: 'github',
			authorizeUrl: 'https://github.com/login/oauth/authorize',
			tokenUrl: 'https://github.com/login/oauth/access_token',
			scope: 'user:email',
			clientId: o.githubId,
			clientSecret: o.githubSecret,
		});
	}
	if (o.googleId && o.googleSecret) {
		providers.push({
			name: 'google',
			authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
			tokenUrl: 'https://oauth2.googleapis.com/token',
			scope: 'openid email profile',
			clientId: o.googleId,
			clientSecret: o.googleSecret,
		});
	}
	return providers;
}

export async function getProvider(name: string): Promise<OAuthProvider> {
	const provider = (await configuredProviders()).find((p) => p.name === name);
	if (!provider) throw new OAuthError(`OAuth provider "${name}" is not configured`);
	return provider;
}

/** Build the provider authorize redirect (state is caller-managed via cookie). */
export function authorizeRedirect(
	provider: OAuthProvider,
	redirectUri: string,
	state: string,
): string {
	const params = new URLSearchParams({
		client_id: provider.clientId,
		redirect_uri: redirectUri,
		scope: provider.scope,
		state,
		response_type: 'code',
	});
	return `${provider.authorizeUrl}?${params}`;
}

interface TokenResponse {
	access_token?: string;
	error?: string;
	error_description?: string;
}

async function exchangeCode(
	provider: OAuthProvider,
	code: string,
	redirectUri: string,
): Promise<string> {
	const res = await fetch(provider.tokenUrl, {
		method: 'POST',
		headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
		body: new URLSearchParams({
			client_id: provider.clientId,
			client_secret: provider.clientSecret,
			code,
			redirect_uri: redirectUri,
			grant_type: 'authorization_code',
		}),
	});
	const data = (await res.json()) as TokenResponse;
	if (!res.ok || !data.access_token) {
		throw new OAuthError(`token exchange failed: ${data.error_description ?? data.error ?? res.status}`);
	}
	return data.access_token;
}

async function fetchGithubEmail(accessToken: string): Promise<{ email: string; name?: string }> {
	const headers = { authorization: `Bearer ${accessToken}`, accept: 'application/vnd.github+json' };
	const userRes = await fetch('https://api.github.com/user', { headers });
	if (!userRes.ok) throw new OAuthError(`github /user failed: ${userRes.status}`);
	const user = (await userRes.json()) as { email?: string; name?: string };
	if (user.email) return { email: user.email, name: user.name };
	// Public email unset — fall back to the primary verified address.
	const emailsRes = await fetch('https://api.github.com/user/emails', { headers });
	if (!emailsRes.ok) throw new OAuthError(`github /user/emails failed: ${emailsRes.status}`);
	const emails = (await emailsRes.json()) as { email: string; primary: boolean; verified: boolean }[];
	const primary = emails.find((e) => e.primary && e.verified) ?? emails.find((e) => e.verified);
	if (!primary) throw new OAuthError('github account has no verified email');
	return { email: primary.email, name: user.name };
}

async function fetchGoogleEmail(accessToken: string): Promise<{ email: string; name?: string }> {
	const res = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
		headers: { authorization: `Bearer ${accessToken}` },
	});
	if (!res.ok) throw new OAuthError(`google userinfo failed: ${res.status}`);
	const info = (await res.json()) as { email?: string; email_verified?: boolean; name?: string };
	if (!info.email || info.email_verified === false) {
		throw new OAuthError('google account has no verified email');
	}
	return { email: info.email, name: info.name };
}

/** Complete the code flow: exchange the code, return the verified identity. */
export async function completeLogin(
	provider: OAuthProvider,
	code: string,
	redirectUri: string,
): Promise<{ email: string; name?: string }> {
	const accessToken = await exchangeCode(provider, code, redirectUri);
	return provider.name === 'github'
		? fetchGithubEmail(accessToken)
		: fetchGoogleEmail(accessToken);
}
