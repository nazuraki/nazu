import { spawn } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import type { AnalysisResult } from '../types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

function binaryPath(): string {
	const bin = resolve(__dirname, '../../native/go-indexer/go-indexer');
	if (existsSync(bin)) return bin;
	throw new Error('go-indexer binary not found. Run: cd apps/indexer/native/go-indexer && go build -o go-indexer .');
}

export async function analyzeGo(projectRoot: string): Promise<AnalysisResult> {
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
				console.error(`[go] go-indexer exited ${code}: ${err}`);
				resolve_p({ files: [], symbols: [], relations: [], dependencies: [], services: [], envvars: [] });
				return;
			}
			try {
				const result = JSON.parse(Buffer.concat(chunks).toString()) as AnalysisResult;
				resolve_p(result);
			} catch (e) {
				reject(new Error(`Failed to parse go-indexer output: ${e}`));
			}
		});

		proc.on('error', reject);
	});
}
