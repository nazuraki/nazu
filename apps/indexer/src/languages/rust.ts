import { spawn } from 'node:child_process';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import type { AnalysisResult } from '../types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

function binaryPath(): string {
	// Prefer release build, fall back to debug
	const rel = resolve(__dirname, '../../native/rust-indexer/target/release/rust-indexer');
	const dbg = resolve(__dirname, '../../native/rust-indexer/target/debug/rust-indexer');
	if (existsSync(rel)) return rel;
	if (existsSync(dbg)) return dbg;
	throw new Error('rust-indexer binary not found. Run: cargo build --manifest-path apps/indexer/native/rust-indexer/Cargo.toml');
}

export async function analyzeRust(projectRoot: string): Promise<AnalysisResult> {
	const binary = binaryPath();
	return new Promise((resolve_p, reject) => {
		const chunks: Buffer[] = [];
		const errChunks: Buffer[] = [];

		const proc = spawn(binary, [projectRoot], { stdio: ['ignore', 'pipe', 'pipe'] });

		proc.stdout.on('data', (chunk: Buffer) => chunks.push(chunk));
		proc.stderr.on('data', (chunk: Buffer) => errChunks.push(chunk));

		proc.on('close', (code) => {
			if (code !== 0) {
				const err = Buffer.concat(errChunks).toString();
				console.error(`[rust] rust-indexer exited ${code}: ${err}`);
				resolve_p({ files: [], symbols: [], relations: [], dependencies: [], services: [], envvars: [] });
				return;
			}
			try {
				const result = JSON.parse(Buffer.concat(chunks).toString()) as AnalysisResult;
				resolve_p(result);
			} catch (e) {
				reject(new Error(`Failed to parse rust-indexer output: ${e}`));
			}
		});

		proc.on('error', reject);
	});
}
