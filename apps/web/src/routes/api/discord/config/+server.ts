import { json } from '@sveltejs/kit';
import { getSection } from '$lib/server/settings.js';

/**
 * Runtime config for the Discord ingest sidecar (#34). The bot is a separate
 * process that can't read the DB directly, so it pulls its config — including
 * the bot token — from here on boot and on an interval, mirroring how the
 * Graphiti sidecar receives credentials. Authenticated like any API route; only
 * reachable on the compose-internal network in normal deployments.
 */
export async function GET() {
	const cfg = await getSection('discord');
	return json({
		enabled: Boolean(cfg.enabled),
		botToken: (cfg.botToken as string) ?? '',
		channels: (cfg.channels as string[]) ?? [],
		statusReactions: cfg.statusReactions !== false,
	});
}
