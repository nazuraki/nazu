import { readFileSync, writeFileSync, unlinkSync, existsSync } from 'node:fs';
import { resolve, relative, join, basename, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';
import glob from 'fast-glob';
import { Project, ts } from 'ts-morph';
import type { AnalysisResult, FileInfo, SymbolInfo } from '../types.js';
import { isTestFile } from './detector.js';

const SCRIPT_RE = /<script(?:[^>]*\blang=["']ts["'][^>]*)?>([^]*?)<\/script>/i;

function extractScript(svelteSource: string): string | null {
	const match = SCRIPT_RE.exec(svelteSource);
	return match ? match[1] : null;
}

export async function analyzeSvelte(projectRoot: string): Promise<AnalysisResult> {
	const svelteFiles = await glob(['**/*.svelte'], {
		cwd: projectRoot,
		ignore: ['**/node_modules/**', '**/.svelte-kit/**', '**/build/**'],
		absolute: true,
	});

	const files: FileInfo[] = [];
	const symbols: SymbolInfo[] = [];

	for (const absPath of svelteFiles) {
		const relPath = relative(projectRoot, absPath);
		const source = readFileSync(absPath, 'utf8');
		const loc = source.split('\n').length;
		files.push({ path: relPath, language: 'svelte', loc, test: isTestFile(relPath) });

		const script = extractScript(source);
		if (!script) continue;

		// Write script block to a temp .ts file and analyze it
		const tmpFile = join(tmpdir(), `nazu-svelte-${randomBytes(6).toString('hex')}.ts`);
		writeFileSync(tmpFile, script, 'utf8');

		try {
			const project = new Project({
				compilerOptions: {
					target: ts.ScriptTarget.ES2022,
					module: ts.ModuleKind.NodeNext,
					moduleResolution: ts.ModuleResolutionKind.NodeNext,
					strict: false,
				},
			});
			const sf = project.addSourceFileAtPath(tmpFile);

			// Component name from filename
			const componentName = basename(relPath, '.svelte');
			symbols.push({
				fqn: `${relPath}::${componentName}`,
				name: componentName,
				kind: 'component',
				signature: relPath,
				doc: '',
				file: relPath,
				line: 1,
				exported: true,
			});

			// Exported functions / reactive declarations within the component
			for (const fn of sf.getFunctions()) {
				const name = fn.getName();
				if (!name) continue;
				symbols.push({
					fqn: `${relPath}::${name}`,
					name,
					kind: 'function',
					signature: fn.getText().split('\n')[0].trim().slice(0, 200),
					doc: '',
					file: relPath,
					line: fn.getStartLineNumber(),
					exported: fn.isExported(),
				});
			}

			for (const va of sf.getVariableDeclarations()) {
				if (!va.isExported()) continue;
				symbols.push({
					fqn: `${relPath}::${va.getName()}`,
					name: va.getName(),
					kind: 'variable',
					signature: va.getText().slice(0, 200),
					doc: '',
					file: relPath,
					line: va.getStartLineNumber(),
					exported: true,
				});
			}
		} finally {
			if (existsSync(tmpFile)) unlinkSync(tmpFile);
		}
	}

	return { files, symbols, relations: [], dependencies: [], services: [], envvars: [] };
}
