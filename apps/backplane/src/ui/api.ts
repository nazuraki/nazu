/** Fetch wrapper for the backplane API with optional bearer-key auth. */

const KEY_STORAGE = 'backplane_api_key';

export function getApiKey(): string {
	return localStorage.getItem(KEY_STORAGE) ?? '';
}

export function setApiKey(key: string): void {
	if (key) localStorage.setItem(KEY_STORAGE, key);
	else localStorage.removeItem(KEY_STORAGE);
}

export function authHeaders(): Record<string, string> {
	const key = getApiKey();
	return key ? { Authorization: `Bearer ${key}` } : {};
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
	const res = await fetch(path, {
		...init,
		headers: { ...authHeaders(), ...(init.headers ?? {}) },
	});
	if (!res.ok) {
		// Expired/missing SSO cookie mid-session: let the app re-check auth and
		// bounce to usr rather than surfacing raw 401s on every panel.
		if (res.status === 401) window.dispatchEvent(new Event('backplane:unauthorized'));
		const body = await res.text();
		let message = `HTTP ${res.status}`;
		try {
			message = (JSON.parse(body) as { error?: string }).error ?? message;
		} catch {
			/* not json */
		}
		throw new Error(message);
	}
	return res.json() as Promise<T>;
}

export interface Identity {
	email: string;
	roles: string[];
	permissions: string[];
}

export interface AuthStatus {
	apiKeyAuth: boolean;
	/** Present when the server is configured for usr SSO. */
	sso: { usrUrl: string; app: string; refreshUrl: string | null } | null;
	authenticated: boolean;
	method: 'api-key' | 'sso' | 'open' | null;
	username: string | null;
	/** Verified usr identity from the `nz_id` cookie, even when it grants no access. */
	identity: Identity | null;
}

/** Auth status for this request; `return` lets the server build the SSO refresh URL. */
export async function fetchAuthStatus(): Promise<AuthStatus> {
	const params = new URLSearchParams({ return: window.location.href });
	return api<AuthStatus>(`/api/auth/status?${params}`);
}

export interface Project {
	name: string;
	gitUrl: string;
	branch: string;
	images: string[];
	target: { type: 'compose'; projectName?: string; composeFiles?: string[]; profiles?: string[] };
	autoDeploy: boolean;
	createdAt: string;
}

export interface ComposeServiceStatus {
	service: string;
	name: string;
	image: string;
	state: string;
	status: string;
}

export interface ImageUpdate {
	image: string;
	remoteDigest: string | null;
	runningDigest: string | null;
	updateAvailable: boolean;
	error?: string;
}

export interface DeploySummary {
	id: number;
	project: string;
	action: 'deploy' | 'update' | 'restart';
	trigger: string;
	status: 'running' | 'succeeded' | 'failed';
	startedAt: string;
	finishedAt: string | null;
}

export interface DeployRecord extends DeploySummary {
	log: string;
}

export interface ContainerSummary {
	id: string;
	fullId: string;
	name: string;
	image: string;
	status: string;
	state: string;
	composeProject: string | null;
	composeService: string | null;
	created: number;
}

export interface PromMatrix {
	status: string;
	data?: { result: { metric: Record<string, string>; values: [number, string][] }[] };
}

export async function queryRange(query: string, minutes: number, stepSec: number): Promise<PromMatrix> {
	const end = Math.floor(Date.now() / 1000);
	const start = end - minutes * 60;
	const params = new URLSearchParams({
		query,
		start: String(start),
		end: String(end),
		step: `${stepSec}s`,
	});
	return api<PromMatrix>(`/api/metrics/query_range?${params}`);
}
