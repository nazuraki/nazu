import { fail, redirect } from '@sveltejs/kit';

import { signIn } from '../../auth';
import {
	localAuthConfigured,
	oauthConfigured,
	oauthViableHost,
	validateLocalCredentials,
} from '$lib/auth';
import {
	issueLocalSession,
	LOCAL_SESSION_COOKIE,
	LOCAL_SESSION_TTL_SECONDS,
} from '$lib/server/local-session';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	if (event.locals.user) redirect(302, '/');
	return {
		// OAuth buttons are hidden on hosts where the provider redirect can
		// never come back (single-label LAN hostnames, bare IPs).
		oauth: (await oauthConfigured()) && oauthViableHost(event.url.hostname),
		local: await localAuthConfigured(),
	};
};

export const actions: Actions = {
	// signIn reads `providerId` and `redirectTo` from the POST form body
	oauth: signIn,

	local: async (event) => {
		const data = await event.request.formData();
		const username = String(data.get('username') ?? '');
		const password = String(data.get('password') ?? '');

		const user = await validateLocalCredentials(username, password);
		if (!user) return fail(400, { error: 'Invalid username or password' });

		const token = await issueLocalSession(user.id);
		if (!token) return fail(500, { error: 'Local sign-in is not configured' });

		event.cookies.set(LOCAL_SESSION_COOKIE, token, {
			path: '/',
			httpOnly: true,
			sameSite: 'lax',
			secure: event.url.protocol === 'https:',
			maxAge: LOCAL_SESSION_TTL_SECONDS,
		});
		redirect(303, '/');
	},
};
