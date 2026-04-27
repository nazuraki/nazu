import { redirect } from '@sveltejs/kit';
import { signIn } from '../../auth';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	if (event.locals.user) redirect(302, '/');
};

export const actions: Actions = {
	github: (event) => signIn('github', event, { redirectTo: '/' }),
	google: (event) => signIn('google', event, { redirectTo: '/' }),
};
