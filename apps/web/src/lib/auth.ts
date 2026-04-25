// Auth placeholder — real implementation in a later step.
// Will be replaced with a proper session/token system once the auth layer is defined.

export interface User {
	id: string;
	email: string;
}

/** Returns the authenticated user from a request, or null if unauthenticated. */
export function getUserFromRequest(_request: Request): User | null {
	return null;
}
