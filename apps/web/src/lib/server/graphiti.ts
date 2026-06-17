import { env } from '$env/dynamic/private';

import { getSection } from './settings.js';

// Compose-internal sidecar. Override GRAPHITI_URL for non-standard setups.
const GRAPHITI_URL = (env.GRAPHITI_URL || 'http://graphiti:8000').replace(/\/+$/, '');
// Episode extraction runs several LLM calls; give it generous headroom.
const TIMEOUT_MS = 60_000;

interface GraphConfig {
	baseUrl: string;
	anthropicKey: string;
	embedderBaseUrl?: string;
	embedderModel?: string;
}

export interface GraphFact {
	fact: string;
	episodeUuids: string[];
	score?: number;
}

export interface AddEpisodeInput {
	/** Document id this episode is derived from (the join key for recall). */
	documentId: string;
	/** Human-readable episode name (we use the document title). */
	name: string;
	content: string;
	/** When the knowledge was added — drives the graph's temporal axis. */
	referenceTime?: Date;
}

/**
 * Resolve graph config from DB-backed settings, or `null` when graph recall is
 * unusable (feature off, or no Anthropic key for entity extraction). Callers
 * treat `null` as "skip graph" — the FTS path always stands on its own.
 */
async function graphConfig(): Promise<GraphConfig | null> {
	const graph = await getSection('graph');
	if (!graph.enabled) return null;

	const ai = await getSection('ai');
	const anthropicKey = (ai.anthropicApiKey as string)?.trim();
	if (!anthropicKey) return null;

	return {
		baseUrl: GRAPHITI_URL,
		anthropicKey,
		embedderBaseUrl: (graph.embedderBaseUrl as string) || undefined,
		embedderModel: (graph.embedderModel as string) || undefined,
	};
}

/** True when graph recall is enabled AND has the credentials it needs. */
export async function isGraphEnabled(): Promise<boolean> {
	return (await graphConfig()) !== null;
}

function headers(cfg: GraphConfig): Record<string, string> {
	const h: Record<string, string> = {
		'content-type': 'application/json',
		'X-Anthropic-Key': cfg.anthropicKey,
	};
	if (cfg.embedderBaseUrl) h['X-Embedder-Base-Url'] = cfg.embedderBaseUrl;
	if (cfg.embedderModel) h['X-Embedder-Model'] = cfg.embedderModel;
	return h;
}

async function post<T>(cfg: GraphConfig, path: string, body: unknown): Promise<T> {
	const res = await fetch(`${cfg.baseUrl}${path}`, {
		method: 'POST',
		headers: headers(cfg),
		body: JSON.stringify(body),
		signal: AbortSignal.timeout(TIMEOUT_MS),
	});
	if (!res.ok) {
		throw new Error(`graphiti ${path} failed: HTTP ${res.status} — ${await res.text()}`);
	}
	return (await res.json()) as T;
}

/**
 * Add a document to the knowledge graph as an episode. Returns the episode uuid
 * (persisted in `graph_episodes` so recall can map graph facts back to the
 * document). Returns `null` when graph recall is disabled. Throws on transport
 * or sidecar errors — the caller decides whether that's fatal (it isn't, on the
 * ingest path).
 */
export async function addEpisode(input: AddEpisodeInput): Promise<string | null> {
	const cfg = await graphConfig();
	if (!cfg) return null;

	const data = await post<{ episode_uuid: string }>(cfg, '/episodes', {
		content: input.content,
		name: input.name,
		document_id: input.documentId,
		source_description: 'nazu document',
		reference_time: (input.referenceTime ?? new Date()).toISOString(),
	});
	return data.episode_uuid;
}

/**
 * Query the knowledge graph for facts relevant to `query`. Returns `[]` when
 * graph recall is disabled. Throws on transport or sidecar errors.
 */
export async function searchGraph(query: string, limit: number): Promise<GraphFact[]> {
	const cfg = await graphConfig();
	if (!cfg) return [];

	const data = await post<{ facts: { fact: string; episode_uuids: string[]; score: number | null }[] }>(
		cfg,
		'/search',
		{ query, limit },
	);
	return data.facts.map((f) => ({
		fact: f.fact,
		episodeUuids: f.episode_uuids ?? [],
		score: f.score ?? undefined,
	}));
}
