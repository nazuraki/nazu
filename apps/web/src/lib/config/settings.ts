// Pure, shared schema for DB-backed application settings. Imported by both the
// server store (lib/server/settings.ts) and the settings UI, so it must not
// pull in any server-only dependencies.

export type FieldType = 'boolean' | 'string' | 'number' | 'list' | 'secret' | 'password';

export interface Field {
	key: string;
	label: string;
	type: FieldType;
	/** Default applied when the section/field has no stored value. */
	default?: unknown;
	/** Optional helper text shown under the field in the UI. */
	help?: string;
}

export interface SectionDef {
	key: string;
	label: string;
	description?: string;
	fields: Field[];
}

/**
 * An app-level feature that can be toggled on/off. Each maps to one nav card
 * and a set of route prefixes gated server-side when disabled.
 */
export interface AppFeature {
	key: string;
	label: string;
	description: string;
	/** Href of the nav card on the home page (also the primary gated route). */
	href: string;
	/** Route prefixes returned 404 when the feature is disabled. */
	routes: string[];
	defaultEnabled: boolean;
}

export const APP_FEATURES: AppFeature[] = [
	{
		key: 'dashboard',
		label: 'Dashboard',
		description: 'System metrics and monitoring',
		href: '/dashboard',
		routes: ['/dashboard', '/api/repos', '/api/steward', '/api/code-graph'],
		defaultEnabled: true,
	},
	{
		key: 'search',
		label: 'Search',
		description: 'Search and browse the library',
		href: '/search',
		routes: ['/search', '/api/search', '/api/recent', '/api/tags', '/api/entries'],
		defaultEnabled: true,
	},
	{
		key: 'tasks',
		label: 'Tasks',
		description: 'Edit the task list',
		href: '/tasks',
		routes: ['/tasks', '/api/tasks'],
		defaultEnabled: true,
	},
	{
		key: 'ingest',
		label: 'Ingest',
		description: 'Add a document to the knowledge base',
		href: '/ingest',
		routes: ['/ingest', '/api/ingest'],
		defaultEnabled: true,
	},
	{
		key: 'nazu',
		label: 'Nazu',
		description: 'Second brain interface',
		href: '/nazu',
		routes: ['/nazu', '/api/nazu'],
		defaultEnabled: true,
	},
];

/** The feature gating a given request path, if any. */
export function featureForPath(pathname: string): AppFeature | undefined {
	return APP_FEATURES.find((f) =>
		f.routes.some((r) => pathname === r || pathname.startsWith(r + '/')),
	);
}

/** The `features` section: one boolean field per app feature. */
const FEATURES_SECTION: SectionDef = {
	key: 'features',
	label: 'Features',
	description: 'Enable or disable app features. Disabled features are hidden and return 404.',
	fields: APP_FEATURES.map((f) => ({
		key: f.key,
		label: f.label,
		type: 'boolean' as const,
		default: f.defaultEnabled,
		help: f.description,
	})),
};

/**
 * All settings sections. `features` is rendered as toggles in the UI; the rest
 * are config forms. Field order here is the display order.
 */
export const SECTIONS: SectionDef[] = [
	FEATURES_SECTION,
	{
		key: 'github',
		label: 'GitHub',
		description: 'Tokens and owners used by the dashboard repo views and webhook.',
		fields: [
			{ key: 'user', label: 'User (personal owner)', type: 'string' },
			{ key: 'org', label: 'Organization owner', type: 'string' },
			{ key: 'personalToken', label: 'Personal access token', type: 'secret' },
			{ key: 'orgToken', label: 'Organization access token', type: 'secret' },
			{
				key: 'apiBaseUrl',
				label: 'API base URL',
				type: 'string',
				default: 'https://api.github.com',
			},
			{ key: 'webhookSecret', label: 'Webhook secret', type: 'secret' },
		],
	},
	{
		key: 'ai',
		label: 'AI',
		description: 'Credentials and model for AI-assisted ingestion and the /nazu chat.',
		fields: [
			{ key: 'anthropicApiKey', label: 'Anthropic API key', type: 'secret' },
			{
				key: 'chatModel',
				label: 'Chat model',
				type: 'string',
				default: 'claude-sonnet-4-6',
				help: 'Anthropic model used to answer /nazu chat questions (RAG over the KB).',
			},
		],
	},
	{
		key: 'graph',
		label: 'Graph recall',
		description:
			'Temporal-knowledge recall via the Graphiti sidecar (#53). When on, ingested documents are added to the knowledge graph and graph hits augment search. Uses the Anthropic key above for entity extraction.',
		fields: [
			{
				key: 'enabled',
				label: 'Enable graph recall',
				type: 'boolean',
				default: false,
				help: 'Off by default. Also start the Graphiti sidecar under Optional services (and run an embeddings endpoint) for this to do anything.',
			},
			{
				key: 'embedderBaseUrl',
				label: 'Embedder base URL',
				type: 'string',
				default: 'http://host.docker.internal:11434/v1',
				help: 'OpenAI-compatible embeddings endpoint (e.g. local Ollama).',
			},
			{
				key: 'embedderModel',
				label: 'Embedder model',
				type: 'string',
				default: 'nomic-embed-text',
			},
		],
	},
	{
		key: 'discord',
		label: 'Discord ingest bot',
		description:
			'Watches Discord channels for YouTube/TikTok links and ingests their transcripts (#34). Runs as an optional sidecar — also start it under Optional services. The bot needs the Message Content privileged intent enabled in the Discord developer portal.',
		fields: [
			{
				key: 'enabled',
				label: 'Enable Discord bot',
				type: 'boolean',
				default: false,
				help: 'Off by default. The sidecar polls this flag and connects/disconnects without a restart.',
			},
			{ key: 'botToken', label: 'Bot token', type: 'secret' },
			{
				key: 'channels',
				label: 'Watched channel IDs',
				type: 'list',
				default: [],
				help: 'Discord channel IDs to watch. Empty watches none.',
			},
			{
				key: 'statusReactions',
				label: 'React with status',
				type: 'boolean',
				default: true,
				help: 'React ✅/♻️/⚠️ on messages to confirm ingest status.',
			},
		],
	},
	{
		key: 'dashboard',
		label: 'Dashboard',
		description: 'Behavior of the dashboard views.',
		fields: [
			{
				key: 'stewardMonthlyBudget',
				label: 'Steward monthly budget (USD)',
				type: 'number',
				default: 50,
			},
			{
				key: 'statusWorkflow',
				label: 'Default status workflow',
				type: 'string',
				default: 'ci.yml',
				help: 'Workflow filename polled for each repo’s build status.',
			},
			{
				key: 'pagesWorkflows',
				label: 'Per-repo Pages workflows',
				type: 'list',
				default: [],
				help: 'Repos with a Pages deploy, as owner/repo=workflow.yml (e.g. me/site=deploy.yml).',
			},
		],
	},
	{
		key: 'auth',
		label: 'Local access',
		description:
			'Optional username/password gate for LAN access. Leave blank for open (zero-conf) access. The password is stored hashed and never shown.',
		fields: [
			{ key: 'localUser', label: 'Username', type: 'string' },
			{ key: 'localPassword', label: 'Password', type: 'password' },
		],
	},
	{
		key: 'oauth',
		label: 'OAuth & remote access',
		description:
			'OAuth providers and Cloudflare settings. Changes apply on the next request. The signing secret is generated automatically.',
		fields: [
			{ key: 'githubId', label: 'GitHub OAuth client ID', type: 'string' },
			{ key: 'githubSecret', label: 'GitHub OAuth client secret', type: 'secret' },
			{ key: 'googleId', label: 'Google OAuth client ID', type: 'string' },
			{ key: 'googleSecret', label: 'Google OAuth client secret', type: 'secret' },
			{ key: 'authSecret', label: 'Auth signing secret (auto)', type: 'secret' },
			{ key: 'cfAccessTeamDomain', label: 'Cloudflare Access team domain', type: 'string' },
			{ key: 'cfAccessAud', label: 'Cloudflare Access AUD', type: 'string' },
			{ key: 'cfTunnelToken', label: 'Cloudflare Tunnel token', type: 'secret' },
		],
	},
];

const SECTION_MAP = new Map(SECTIONS.map((s) => [s.key, s]));

export function getSectionDef(key: string): SectionDef | undefined {
	return SECTION_MAP.get(key);
}

export function isSecretField(f: Field): boolean {
	return f.type === 'secret' || f.type === 'password';
}

/** Sentinel returned by the API for a secret that has a stored value. */
export const SECRET_SET = '__SET__';

/** Build the default config object for a section from its field defaults. */
export function sectionDefaults(def: SectionDef): Record<string, unknown> {
	const out: Record<string, unknown> = {};
	for (const f of def.fields) {
		if (f.default !== undefined) out[f.key] = f.default;
	}
	return out;
}
