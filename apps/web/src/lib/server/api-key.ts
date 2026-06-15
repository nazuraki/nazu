import { timingSafeEqual } from 'node:crypto';
import type { User } from '$lib/auth';

/** Identity stamped on requests authenticated by a static API key. */
export const AGENT_EMAIL = 'agent@nazu.local';

/** Parse the configured key list from a raw env string (comma-separated). */
export function parseApiKeys(raw: string | undefined): string[] {
	return (raw ?? '')
		.split(',')
		.map((k) => k.trim())
		.filter(Boolean);
}

/** Extract a presented key from either `Authorization: Bearer <key>` or `X-API-Key`. */
export function extractApiKey(request: Request): string | null {
	const auth = request.headers.get('Authorization');
	if (auth?.startsWith('Bearer ')) return auth.slice(7).trim() || null;
	return request.headers.get('X-API-Key')?.trim() || null;
}

function safeEqual(a: string, b: string): boolean {
	const ab = Buffer.from(a);
	const bb = Buffer.from(b);
	// timingSafeEqual requires equal-length buffers; a length mismatch is a miss.
	if (ab.length !== bb.length) return false;
	return timingSafeEqual(ab, bb);
}

/**
 * Validate a static API key for non-interactive agents / MCP clients. Returns an
 * agent identity on match, null otherwise. Returns null when no keys are
 * configured, so the feature stays off until a key is set.
 *
 * Kept free of `$env` imports so the matching logic is unit-testable in isolation;
 * the caller supplies the configured key list (see hooks.server.ts).
 */
export function validateApiKey(request: Request, keys: string[]): User | null {
	if (keys.length === 0) return null;
	const presented = extractApiKey(request);
	if (!presented) return null;
	if (!keys.some((k) => safeEqual(presented, k))) return null;
	return { id: 'agent', email: AGENT_EMAIL, source: 'api-key' };
}
