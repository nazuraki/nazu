import { startBot, type BotHandle } from './bot.js';
import { fetchConfig } from './config.js';

// How often to re-pull config so Settings-UI changes (enable/disable, channel
// list, new token) take effect without restarting the container.
const REFRESH_MS = Number(process.env.DISCORD_CONFIG_REFRESH_MS ?? 60_000);

async function main(): Promise<void> {
	let handle: BotHandle | null = null;
	let runningToken = '';

	async function reconcile(): Promise<void> {
		let cfg;
		try {
			cfg = await fetchConfig();
		} catch (err) {
			console.error('discord: config fetch failed (will retry next tick)', err);
			return;
		}

		const shouldRun = cfg.enabled && cfg.botToken.length > 0;
		if (shouldRun && (!handle || cfg.botToken !== runningToken)) {
			// First start, or the token changed — (re)connect.
			if (handle) await handle.destroy();
			console.log('discord: connecting…');
			handle = await startBot(cfg);
			runningToken = cfg.botToken;
		} else if (!shouldRun && handle) {
			console.log('discord: disabled — disconnecting');
			await handle.destroy();
			handle = null;
			runningToken = '';
		} else if (handle) {
			// Already connected with the same token — just refresh live config.
			handle.updateConfig(cfg);
		}
	}

	await reconcile();
	setInterval(() => void reconcile(), REFRESH_MS);
	console.log(`discord: polling config every ${REFRESH_MS}ms`);
}

main().catch((err) => {
	console.error('discord: fatal', err);
	process.exit(1);
});
