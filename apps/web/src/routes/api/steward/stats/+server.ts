import { env } from '$env/dynamic/private';
import { json } from '@sveltejs/kit';
import { getSql } from '$lib/server/db.js';

export async function GET() {
	const budget = Number.parseFloat(env.STEWARD_MONTHLY_BUDGET ?? "50");

	try {
		const sql = getSql();
		const runs = await sql<{
			run_id: string;
			task: string;
			outcome: string;
			created_at: string;
			duration_ms: number;
			tokens_input: number;
			tokens_output: number;
		}[]>`
			SELECT run_id, task, outcome, created_at, duration_ms, tokens_input, tokens_output
			FROM steward_runs
			ORDER BY created_at DESC
			LIMIT 50
		`;

		const dailyTokens = await sql<{ date: string; tokens_input: number; tokens_output: number }[]>`
			SELECT
				DATE(created_at)::text AS date,
				SUM(tokens_input)::int  AS tokens_input,
				SUM(tokens_output)::int AS tokens_output
			FROM steward_runs
			WHERE created_at >= NOW() - INTERVAL '30 days'
			GROUP BY DATE(created_at)
			ORDER BY date ASC
		`;

		const runsWithCost = runs.map((r) => ({
			id: r.run_id,
			workflow: r.task,
			status: r.outcome === "success" ? "success" : "failure",
			created_at: r.created_at,
			duration_ms: r.duration_ms,
			tokens_input: r.tokens_input,
			tokens_output: r.tokens_output,
			cost_usd: (r.tokens_input * 3 + r.tokens_output * 15) / 1_000_000,
			model: "claude-sonnet-4-6",
		}));

		const totalTokens = runs.reduce((s, r) => s + r.tokens_input + r.tokens_output, 0);
		const successCount = runs.filter((r) => r.outcome === "success").length;
		const successRate = runs.length > 0 ? Math.round((successCount / runs.length) * 100) : 0;
		const totalCost = runsWithCost.reduce((s, r) => s + r.cost_usd, 0);

		return json({ budget, totalCost, totalTokens, successRate, runs: runsWithCost, dailyTokens });
	} catch {
		// steward_runs table may not exist yet
		return json({ budget, totalCost: 0, totalTokens: 0, successRate: 0, runs: [], dailyTokens: [] });
	}
}
