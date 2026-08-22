import { Hono } from 'hono';
import type { MiddlewareHandler } from 'hono';
import { getCookie } from 'hono/cookie';

import { validateApiKeyToken } from './lib/api-keys.js';
import {
	openMode,
	openUser,
	validateBasicHeader,
	validateSession,
	verifyLocalCredentials,
	type AuthUser,
} from './lib/auth.js';
import { can } from './lib/permissions.js';
import { jwks } from './lib/jwt.js';
import { authRoutes, SESSION_COOKIE } from './routes/auth.js';
import { keysRoutes } from './routes/keys.js';
import { permissionsRoutes } from './routes/permissions.js';
import { profileRoutes } from './routes/profile.js';
import { rolesRoutes } from './routes/roles.js';
import { settingsRoutes } from './routes/settings.js';
import { usersRoutes } from './routes/users.js';

export interface AppEnv {
	Variables: { user: AuthUser };
}

/**
 * Per-action authorization for an admin area: GETs need `<area>:read`, other
 * methods `<area>:write` — each satisfiable by the grantable `admin` umbrella
 * (root identities always pass). Fine-grained by design: grant e.g. only
 * `users:read` to build a read-only user directory client.
 */
export function requireArea(area: string): MiddlewareHandler<AppEnv> {
	return async (c, next) => {
		const permission = c.req.method === 'GET' ? `${area}:read` : `${area}:write`;
		if (!(await can(c.var.user, permission))) {
			return c.json({ error: `requires usr permission "${permission}"` }, 403);
		}
		return next();
	};
}

/** Auth-exempt paths: liveness plus what the SPA needs to reach a login. */
const OPEN_PREFIXES = ['/api/auth/'];
const OPEN_PATHS = new Set(['/api/health']);

/**
 * Auth ladder, mirroring the nazu web app: role-mapped API key (x-api-key or
 * bearer, resolved against the api_keys table) → session cookie (OAuth or
 * local login) → Basic header (local admin) → zero-conf open mode when
 * nothing is configured. No WWW-Authenticate challenge — the SPA has its own
 * login screen.
 */
async function authenticate(
	headers: { apiKey?: string; authorization?: string },
	sessionToken: string | undefined,
): Promise<AuthUser | null> {
	const bearer = headers.authorization?.startsWith('Bearer ')
		? headers.authorization.slice(7)
		: undefined;
	const token = headers.apiKey ?? bearer;
	if (token) {
		const key = await validateApiKeyToken(token);
		if (key) {
			return { id: key.name, email: null, userId: null, keyId: key.id, root: false, method: 'api-key' };
		}
	}

	const sessionUser = await validateSession(sessionToken);
	if (sessionUser) return sessionUser;

	const basic = validateBasicHeader(headers.authorization);
	if (basic) {
		const basicUser = await verifyLocalCredentials(basic[0], basic[1]);
		if (basicUser) return basicUser;
	}

	if (await openMode()) return openUser();
	return null;
}

export function createApp(): Hono<AppEnv> {
	const app = new Hono<AppEnv>();

	app.get('/api/health', (c) => c.json({ ok: true }));

	// Public signing keys so sibling apps verify `nz_id` (and #97 tokens) offline.
	app.get('/.well-known/jwks.json', async (c) => {
		c.header('Cache-Control', 'public, max-age=300');
		return c.json(await jwks());
	});

	app.use('/api/*', async (c, next) => {
		const user = await authenticate(
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

	app.route('/api/auth', authRoutes());
	app.route('/api/profile', profileRoutes());
	app.route('/api/users', usersRoutes());
	app.route('/api/roles', rolesRoutes());
	app.route('/api/keys', keysRoutes());
	app.route('/api/permissions', permissionsRoutes());
	app.route('/api/settings', settingsRoutes());

	app.notFound((c) =>
		c.req.path.startsWith('/api/') ? c.json({ error: 'not found' }, 404) : c.text('not found', 404),
	);

	return app;
}
