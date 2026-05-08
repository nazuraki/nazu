#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { findProject, loadProjects } from './registry.js';
import { deleteGraph, disconnect } from './graph/client.js';
import { ensureSchema } from './graph/schema.js';
import { writeProject, writeAll } from './graph/writer.js';
import { analyzeTypeScript } from './languages/typescript.js';
import { analyzeSvelte } from './languages/svelte.js';
import { analyzePython } from './languages/python.js';
import { analyzeRust } from './languages/rust.js';
import { analyzeGo } from './languages/go.js';
import type { AnalysisResult } from './types.js';

const { values } = parseArgs({
	options: {
		project: { type: 'string', short: 'p' },
		path: { type: 'string' },
		graph: { type: 'string', short: 'g' },
		help: { type: 'boolean', short: 'h' },
	},
	allowPositionals: false,
	strict: false,
});

if (values.help) {
	console.log(`
Usage:
  index --project <name>           Index a registered project by name
  index --path <dir> --graph <g>   Index an arbitrary directory into a named graph

Options:
  -p, --project   Registered project name (see projects.json)
  --path          Path to project root
  -g, --graph     FalkorDB graph name (e.g. code:myproject)
  -h, --help      Show this help
`);
	process.exit(0);
}

async function mergeResults(results: AnalysisResult[]): Promise<AnalysisResult> {
	const merged: AnalysisResult = { files: [], symbols: [], relations: [], dependencies: [], services: [], envvars: [] };
	const seenDeps = new Set<string>();
	const seenSvcs = new Set<string>();
	const seenEvs = new Set<string>();
	const seenSymbols = new Set<string>();

	for (const r of results) {
		merged.files.push(...r.files);
		for (const s of r.symbols) {
			if (!seenSymbols.has(s.fqn)) { seenSymbols.add(s.fqn); merged.symbols.push(s); }
		}
		merged.relations.push(...r.relations);
		for (const d of r.dependencies) {
			const key = `${d.ecosystem}:${d.name}`;
			if (!seenDeps.has(key)) { seenDeps.add(key); merged.dependencies.push(d); }
		}
		for (const s of r.services) {
			if (!seenSvcs.has(s.name)) { seenSvcs.add(s.name); merged.services.push(s); }
		}
		for (const e of r.envvars) {
			if (!seenEvs.has(e.name)) { seenEvs.add(e.name); merged.envvars.push(e); }
		}
	}
	return merged;
}

async function indexProject(projectRoot: string, graphName: string, projectName: string) {
	console.log(`Indexing ${projectName} → ${graphName}`);
	console.log(`  Root: ${projectRoot}`);

	if (!existsSync(projectRoot)) {
		throw new Error(`Project root does not exist: ${projectRoot}`);
	}

	// Detect which languages are present
	const hasTS = existsSync(`${projectRoot}/tsconfig.json`) || existsSync(`${projectRoot}/package.json`);
	const hasPy = existsSync(`${projectRoot}/requirements.txt`) || existsSync(`${projectRoot}/pyproject.toml`);
	const hasRust = existsSync(`${projectRoot}/Cargo.toml`);
	const hasGo = existsSync(`${projectRoot}/go.mod`);

	console.log(`  Languages: ${[hasTS && 'typescript/svelte', hasPy && 'python', hasRust && 'rust', hasGo && 'go'].filter(Boolean).join(', ')}`);

	// Fresh rebuild
	console.log(`  Clearing graph ${graphName}...`);
	await deleteGraph(graphName);
	await ensureSchema(graphName);

	const results: AnalysisResult[] = [];

	if (hasTS) {
		process.stdout.write('  Analyzing TypeScript...');
		const r = await analyzeTypeScript(projectRoot);
		console.log(` ${r.symbols.length} symbols, ${r.files.length} files`);
		results.push(r);

		process.stdout.write('  Analyzing Svelte...');
		const sv = await analyzeSvelte(projectRoot);
		console.log(` ${sv.symbols.length} components/symbols`);
		results.push(sv);
	}

	if (hasPy) {
		process.stdout.write('  Analyzing Python...');
		const r = await analyzePython(projectRoot);
		console.log(` ${r.symbols.length} symbols`);
		results.push(r);
	}

	if (hasRust) {
		process.stdout.write('  Analyzing Rust...');
		const r = await analyzeRust(projectRoot);
		console.log(` ${r.symbols.length} symbols`);
		results.push(r);
	}

	if (hasGo) {
		process.stdout.write('  Analyzing Go...');
		const r = await analyzeGo(projectRoot);
		console.log(` ${r.symbols.length} symbols`);
		results.push(r);
	}

	const merged = await mergeResults(results);
	const languages = [hasTS && 'typescript', hasTS && 'svelte', hasPy && 'python', hasRust && 'rust', hasGo && 'go'].filter(Boolean) as string[];

	console.log(`  Writing to graph...`);
	await writeProject(graphName, projectName, projectRoot, languages);
	await writeAll(graphName, merged);

	console.log(`  Done. ${merged.files.length} files, ${merged.symbols.length} symbols, ${merged.relations.length} relations, ${merged.dependencies.length} deps`);
}

async function main() {
	try {
		if (values.project) {
			const entry = findProject(values.project as string);
			if (!entry) {
				const names = loadProjects().map((p) => p.name).join(', ');
				throw new Error(`Unknown project "${values.project}". Known: ${names}`);
			}
			await indexProject(resolve(entry.path), entry.graph, entry.name);
		} else if (values.path && values.graph) {
			const projectRoot = resolve(values.path as string);
			const graphName = values.graph as string;
			const name = graphName.replace('code:', '');
			await indexProject(projectRoot, graphName, name);
		} else {
			console.error('Error: provide --project <name> or --path <dir> --graph <g>');
			process.exit(1);
		}
	} catch (err) {
		console.error('Error:', err instanceof Error ? err.message : err);
		process.exit(1);
	} finally {
		await disconnect();
	}
}

main();
