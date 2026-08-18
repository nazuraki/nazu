import { Hono } from 'hono';
import { getCookie } from 'hono/cookie';

import {
	openMode,
	openUser,
	validateApiKey,
	validateBasicHeader,
	validateSession,
	verifyLocalCredentials,
	type AuthUser,
} from './lib/auth.js';
import { authRoutes, SESSION_COOKIE } from './routes/auth.js';
import { permissionsRoutes } from './routes/permissions.js';
import { profileRoutes } from './routes/profile.js';
import { rolesRoutes } from './routes/roles.js';
import { settingsRoutes } from './routes/settings.js';
import { usersRoutes } from './routes/users.js';

export interface AppEnv {
	Variables: { user: AuthUser };
}

export interface AppOptions {
	/** Static key for machine clients (other apps, agents); '' disables it. */
	apiKey: string;
}

/** Auth-exempt paths: liveness plus what the SPA needs to reach a login. */
const OPEN_PREFIXES = ['/api/auth/'];
const OPEN_PATHS = new Set(['/api/health']);

/**
 * Auth ladder, mirroring the nazu web app: static API key → session cookie
 * (OAuth or local login) → Basic header (local admin) → zero-conf open mode
 * when nothing is configured. No WWW-Authenticate challenge — the SPA has its
 * own login screen.
 */
async function authenticate(
	apiKey: string,
	headers: { apiKey?: string; authorization?: string },
	sessionToken: string | undefined,
): Promise<AuthUser | null> {
	const bearer = headers.authorization?.startsWith('Bearer ')
		? headers.authorization.slice(7)
		: undefined;
	const keyUser = validateApiKey(headers.apiKey ?? bearer, apiKey);
	if (keyUser) return keyUser;

	const sessionUser = await validateSession(sessionToken);
	if (sessionUser) return sessionUser;

	const basic = validateBasicHeader(headers.authorization);
	if (basic) {
		const basicUser = await verifyLocalCredentials(basic[0], basic[1]);
		if (basicUser) return basicUser;
	}

	if (await openMode(apiKey)) return openUser();
	return null;
}

export function createApp(opts: AppOptions): Hono<AppEnv> {
	const app = new Hono<AppEnv>();

	app.get('/api/health', (c) => c.json({ ok: true }));

	app.use('/api/*', async (c, next) => {
		const user = await authenticate(
			opts.apiKey,
			{ apiKey: c.req.header('x-api-key'), authorization: c.req.header('authorization') },
			getCookie(c, SESSION_COOKIE),
		);
		if (user) c.set('user', user);
		if (OPEN_PATHS.has(c.req.path) || OPEN_PREFIXES.some((p) => c.req.path.startsWith(p))) {
			return next();
		}
		if (!user) return c.json({ error: 'unauthorized' }, 401);
		return next();
	});

	app.route('/api/auth', authRoutes(opts));
	app.route('/api/profile', profileRoutes());
	app.route('/api/users', usersRoutes());
	app.route('/api/roles', rolesRoutes());
	app.route('/api/permissions', permissionsRoutes());
	app.route('/api/settings', settingsRoutes());

	app.notFound((c) =>
		c.req.path.startsWith('/api/') ? c.json({ error: 'not found' }, 404) : c.text('not found', 404),
	);

	return app;
}
