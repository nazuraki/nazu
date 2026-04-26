import { WEB_URL } from "./endpoints.js";

export async function apiGet(path: string, init?: RequestInit): Promise<Response> {
	return fetch(`${WEB_URL}${path}`, { ...init, method: "GET" });
}

export async function apiJson<T = unknown>(path: string, init?: RequestInit): Promise<T> {
	const res = await apiGet(path, init);
	if (!res.ok) {
		throw new Error(`GET ${path} → ${res.status}: ${await res.text()}`);
	}
	return (await res.json()) as T;
}
