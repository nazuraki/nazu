import { redirect } from '@sveltejs/kit';
import { signIn } from '../../auth';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	if (event.locals.user) redirect(302, '/');
};

// signIn reads `providerId` and `redirectTo` from the POST form body
export const actions: Actions = { default: signIn };
