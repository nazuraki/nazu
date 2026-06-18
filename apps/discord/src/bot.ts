import { Client, Events, GatewayIntentBits, Partials, type Message } from 'discord.js';

import type { BotConfig } from './config.js';
import { ingestUrl } from './ingest.js';
import { extractWatchableLinks } from './links.js';
import { reactionFor } from './reactions.js';

export interface BotHandle {
	/** Hot-swap watched-channel / reaction config without reconnecting. */
	updateConfig(cfg: BotConfig): void;
	/** Disconnect from the gateway. */
	destroy(): Promise<void>;
}

/**
 * Connect to the Discord gateway and watch for messages. Requires the Message
 * Content privileged intent. Returns a handle to update config in place or shut
 * down. The connection lifecycle (start/stop on config change) is driven by
 * index.ts.
 */
export async function startBot(initial: BotConfig): Promise<BotHandle> {
	let config = initial;
	const client = new Client({
		intents: [
			GatewayIntentBits.Guilds,
			GatewayIntentBits.GuildMessages,
			GatewayIntentBits.MessageContent,
		],
		partials: [Partials.Channel],
	});

	client.once(Events.ClientReady, (c) => console.log(`discord: ready as ${c.user.tag}`));
	client.on(Events.MessageCreate, (msg) => {
		// Fire and forget — handler swallows its own errors.
		void handleMessage(msg, config);
	});

	await client.login(config.botToken);
	return {
		updateConfig: (cfg) => {
			config = cfg;
		},
		destroy: () => client.destroy(),
	};
}

async function handleMessage(msg: Message, config: BotConfig): Promise<void> {
	if (msg.author.bot) return;
	if (config.channels.length > 0 && !config.channels.includes(msg.channelId)) return;

	for (const url of extractWatchableLinks(msg.content)) {
		const result = await ingestUrl(url, { postedBy: msg.author.username });
		console.log(`discord: ${url} → ${result.status}`);
		if (!config.statusReactions) continue;
		const emoji = reactionFor(result.status);
		if (!emoji) continue;
		try {
			await msg.react(emoji);
		} catch (err) {
			// Missing Add Reactions permission, deleted message, etc. — non-fatal.
			console.error('discord: react failed', err);
		}
	}
}
