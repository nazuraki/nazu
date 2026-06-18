import { describe, it, expect, vi } from 'vitest';

import { fetchConfig } from './config.js';

function res(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), { status });
}

describe('fetchConfig', () => {
	it('passes a normalized full payload through', async () => {
		const f = vi
			.fn()
			.mockResolvedValue(
				res({ enabled: true, botToken: 'tok', channels: ['1', '2'], statusReactions: false }),
			);
		expect(await fetchConfig(f)).toEqual({
			enabled: true,
			botToken: 'tok',
			channels: ['1', '2'],
			statusReactions: false,
		});
		expect(String(f.mock.calls[0][0])).toMatch(/\/api\/discord\/config$/);
	});

	it('applies safe defaults for missing fields (reactions default on)', async () => {
		expect(await fetchConfig(vi.fn().mockResolvedValue(res({})))).toEqual({
			enabled: false,
			botToken: '',
			channels: [],
			statusReactions: true,
		});
	});

	it('drops non-string channel entries', async () => {
		const cfg = await fetchConfig(vi.fn().mockResolvedValue(res({ channels: ['a', 5, null, 'b'] })));
		expect(cfg.channels).toEqual(['a', 'b']);
	});

	it('throws on a non-2xx response', async () => {
		await expect(fetchConfig(vi.fn().mockResolvedValue(res({}, 500)))).rejects.toThrow(/HTTP 500/);
	});
});
