import { describe, expect, it } from 'vitest';

import { authorizeRedirect, type OAuthProvider } from './oauth.js';

const github: OAuthProvider = {
	name: 'github',
	authorizeUrl: 'https://github.com/login/oauth/authorize',
	tokenUrl: 'https://github.com/login/oauth/access_token',
	scope: 'user:email',
	clientId: 'cid',
	clientSecret: 'shh',
};

describe('authorizeRedirect', () => {
	it('builds the provider URL with state and redirect_uri', () => {
		const url = new URL(authorizeRedirect(github, 'https://usr.example/api/auth/oauth/github/callback', 'st4te'));
		expect(url.origin + url.pathname).toBe('https://github.com/login/oauth/authorize');
		expect(url.searchParams.get('client_id')).toBe('cid');
		expect(url.searchParams.get('state')).toBe('st4te');
		expect(url.searchParams.get('redirect_uri')).toBe(
			'https://usr.example/api/auth/oauth/github/callback',
		);
		expect(url.searchParams.get('response_type')).toBe('code');
	});

	it('never leaks the client secret', () => {
		const url = authorizeRedirect(github, 'https://usr.example/cb', 's');
		expect(url).not.toContain('shh');
	});
});
