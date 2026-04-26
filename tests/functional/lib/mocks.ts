import { MOCKS_URL } from "./endpoints.js";

export type MockFixture = {
	method?: string;
	path: string;
	status?: number;
	body?: unknown;
	headers?: Record<string, string>;
};

export type RecordedCall = {
	method: string;
	path: string;
	headers: Record<string, string>;
	body: unknown;
	timestamp: number;
};

export async function setFixture(service: "github", fixture: MockFixture): Promise<void> {
	const res = await fetch(`${MOCKS_URL}/__admin__/fixtures/${service}`, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(fixture),
	});
	if (!res.ok) throw new Error(`setFixture failed: ${res.status} ${await res.text()}`);
}

export async function resetMocks(): Promise<void> {
	const res = await fetch(`${MOCKS_URL}/__admin__/reset`, { method: "POST" });
	if (!res.ok) throw new Error(`resetMocks failed: ${res.status}`);
}

export async function getCalls(service: "github"): Promise<RecordedCall[]> {
	const res = await fetch(`${MOCKS_URL}/__admin__/calls/${service}`);
	if (!res.ok) throw new Error(`getCalls failed: ${res.status}`);
	return (await res.json()) as RecordedCall[];
}
