import { spawn } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AnalysisResult } from '../types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
// __dirname is apps/indexer/dist/languages/ at runtime; py/ is at apps/indexer/py/
const JEDI_SCRIPT = resolve(__dirname, '../../py/jedi_indexer.py');

const PYTHON = process.env.PYTHON ?? '/opt/homebrew/bin/python3.14';

export async function analyzePython(projectRoot: string): Promise<AnalysisResult> {
	return new Promise((resolve_p, reject) => {
		const chunks: Buffer[] = [];
		const errChunks: Buffer[] = [];

		const proc = spawn(PYTHON, [JEDI_SCRIPT, projectRoot], { stdio: ['ignore', 'pipe', 'pipe'] });

		proc.stdout.on('data', (chunk: Buffer) => chunks.push(chunk));
		proc.stderr.on('data', (chunk: Buffer) => errChunks.push(chunk));

		proc.on('close', (code) => {
			if (code !== 0) {
				const err = Buffer.concat(errChunks).toString();
				console.error(`[python] jedi_indexer exited ${code}: ${err}`);
				// Return empty rather than failing the whole index run
				resolve_p({ files: [], symbols: [], relations: [], dependencies: [], services: [], envvars: [] });
				return;
			}
			try {
				const result = JSON.parse(Buffer.concat(chunks).toString()) as AnalysisResult;
				resolve_p(result);
			} catch (e) {
				reject(new Error(`Failed to parse jedi_indexer output: ${e}`));
			}
		});

		proc.on('error', reject);
	});
}
