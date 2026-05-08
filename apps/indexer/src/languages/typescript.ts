import { readFileSync, existsSync } from 'node:fs';
import { relative, resolve, join } from 'node:path';
import { Project, SyntaxKind, Node, SourceFile, ts, type FunctionDeclaration } from 'ts-morph';
import type { AnalysisResult, SymbolInfo, RelationInfo, FileInfo, EnvVarInfo, ServiceInfo } from '../types.js';
import { isTestFile } from './detector.js';

// Service patterns: map regex → {name, technology}
const SERVICE_PATTERNS: Array<{ re: RegExp; name: string; technology: string }> = [
	{ re: /new\s+Redis\s*\(/i, name: 'falkordb', technology: 'redis' },
	{ re: /postgres\s*\(/i, name: 'postgres', technology: 'postgres' },
	{ re: /DATABASE_URL/i, name: 'postgres', technology: 'postgres' },
	{ re: /new\s+S3Client\s*\(/i, name: 'minio', technology: 's3' },
	{ re: /minio/i, name: 'minio', technology: 's3' },
	{ re: /dockerode/i, name: 'docker', technology: 'docker' },
	{ re: /tauri/i, name: 'tauri', technology: 'tauri' },
];

const ENV_RE = /process\.env\.([A-Z_][A-Z0-9_]*)/g;

function countLines(text: string): number {
	return text.split('\n').length;
}

function fqn(relativePath: string, name: string): string {
	return `${relativePath}::${name}`;
}

function getJsDoc(node: Node): string {
	if (Node.isJSDocable(node)) {
		const docs = node.getJsDocs();
		if (docs.length > 0) return docs[docs.length - 1].getDescription().trim();
	}
	return '';
}

function getSignature(node: Node): string {
	// Return first line of the node's text (the declaration line)
	return node.getText().split('\n')[0].trim().slice(0, 200);
}

function enclosingFqn(node: Node, filePath: string): string | null {
	let cur: Node | undefined = node.getParent();
	while (cur) {
		if (Node.isFunctionDeclaration(cur)) {
			const name = cur.getName();
			return name ? fqn(filePath, name) : null;
		}
		if (Node.isMethodDeclaration(cur)) {
			return fqn(filePath, cur.getName());
		}
		if (Node.isFunctionExpression(cur) || Node.isArrowFunction(cur)) {
			return null;
		}
		cur = cur.getParent();
	}
	return null;
}

function analyzeSourceFile(
	sf: SourceFile,
	projectRoot: string
): { symbols: SymbolInfo[]; relations: RelationInfo[]; envvars: EnvVarInfo[]; services: ServiceInfo[] } {
	const symbols: SymbolInfo[] = [];
	const relations: RelationInfo[] = [];
	const envvars: EnvVarInfo[] = [];
	const services: ServiceInfo[] = [];
	const seenServices = new Set<string>();
	const seenEnvVars = new Set<string>();

	const absPath = sf.getFilePath();
	const relPath = relative(projectRoot, absPath);

	// ── Functions
	for (const fn of sf.getFunctions()) {
		const name = fn.getName();
		if (!name) continue;
		symbols.push({
			fqn: fqn(relPath, name),
			name,
			kind: 'function',
			signature: getSignature(fn),
			doc: getJsDoc(fn),
			file: relPath,
			line: fn.getStartLineNumber(),
			exported: fn.isExported(),
		});
	}

	// ── Classes + methods
	for (const cls of sf.getClasses()) {
		const clsName = cls.getName();
		if (!clsName) continue;
		const baseNames = cls.getBaseTypes().map((t) => t.getSymbol()?.getName()).filter(Boolean) as string[];
		symbols.push({
			fqn: fqn(relPath, clsName),
			name: clsName,
			kind: 'class',
			signature: getSignature(cls),
			doc: getJsDoc(cls),
			file: relPath,
			line: cls.getStartLineNumber(),
			exported: cls.isExported(),
		});
		// EXTENDS edges
		for (const base of baseNames) {
			relations.push({ fromFqn: fqn(relPath, clsName), toFqn: base, rel: 'EXTENDS' });
		}
		// IMPLEMENTS edges
		for (const iface of cls.getImplements()) {
			const ifaceName = iface.getExpression().getText();
			relations.push({ fromFqn: fqn(relPath, clsName), toFqn: ifaceName, rel: 'IMPLEMENTS' });
		}
		for (const method of cls.getMethods()) {
			const methodName = `${clsName}.${method.getName()}`;
			symbols.push({
				fqn: fqn(relPath, methodName),
				name: methodName,
				kind: 'method',
				signature: getSignature(method),
				doc: getJsDoc(method),
				file: relPath,
				line: method.getStartLineNumber(),
				exported: method.getScope() !== 'private' && method.getScope() !== 'protected',
			});
		}
	}

	// ── Interfaces
	for (const iface of sf.getInterfaces()) {
		symbols.push({
			fqn: fqn(relPath, iface.getName()),
			name: iface.getName(),
			kind: 'interface',
			signature: getSignature(iface),
			doc: getJsDoc(iface),
			file: relPath,
			line: iface.getStartLineNumber(),
			exported: iface.isExported(),
		});
	}

	// ── Type aliases
	for (const ta of sf.getTypeAliases()) {
		symbols.push({
			fqn: fqn(relPath, ta.getName()),
			name: ta.getName(),
			kind: 'type',
			signature: getSignature(ta),
			doc: getJsDoc(ta),
			file: relPath,
			line: ta.getStartLineNumber(),
			exported: ta.isExported(),
		});
	}

	// ── Enums
	for (const en of sf.getEnums()) {
		symbols.push({
			fqn: fqn(relPath, en.getName()),
			name: en.getName(),
			kind: 'enum',
			signature: getSignature(en),
			doc: getJsDoc(en),
			file: relPath,
			line: en.getStartLineNumber(),
			exported: en.isExported(),
		});
	}

	// ── SvelteKit route detection (file path heuristic)
	if (relPath.match(/routes\/.*\+server\.ts$/)) {
		const routeName = relPath.replace(/^.*routes/, '').replace('/+server.ts', '');
		symbols.push({
			fqn: fqn(relPath, routeName),
			name: routeName,
			kind: 'route',
			signature: relPath,
			doc: '',
			file: relPath,
			line: 1,
			exported: true,
		});
	}

	// ── Call expressions (resolved via type checker)
	for (const callExpr of sf.getDescendantsOfKind(SyntaxKind.CallExpression)) {
		const expr = callExpr.getExpression();
		const callerFqn = enclosingFqn(callExpr, relPath);
		if (!callerFqn) continue;

		try {
			const sym = expr.getSymbol() ?? expr.getType().getSymbol();
			if (!sym) continue;
			const decls = sym.getDeclarations();
			for (const decl of decls) {
				const declFile = relative(projectRoot, decl.getSourceFile().getFilePath());
				const declName = sym.getName();
				if (declName === '__type' || declName === 'anonymous') continue;
				relations.push({ fromFqn: callerFqn, toFqn: fqn(declFile, declName), rel: 'CALLS' });
			}
		} catch {
			// type resolution failed — skip
		}
	}

	// ── Import relationships
	for (const imp of sf.getImportDeclarations()) {
		const moduleSpecifier = imp.getModuleSpecifierSourceFile();
		if (!moduleSpecifier) continue;
		const targetPath = relative(projectRoot, moduleSpecifier.getFilePath());
		for (const named of imp.getNamedImports()) {
			const localSym = named.getNameNode().getSymbol();
			if (!localSym) continue;
			const imported = localSym.getAliasedSymbol() ?? localSym;
			const importedName = imported.getName();
			relations.push({ fromFqn: fqn(relPath, named.getName()), toFqn: fqn(targetPath, importedName), rel: 'IMPORTS' });
		}
	}

	// ── Env var detection
	const text = sf.getFullText();
	for (const match of text.matchAll(ENV_RE)) {
		const varName = match[1];
		if (!seenEnvVars.has(varName)) {
			seenEnvVars.add(varName);
			envvars.push({ name: varName, purpose: '' });
		}
	}

	// ── Service detection
	for (const { re, name, technology } of SERVICE_PATTERNS) {
		if (re.test(text) && !seenServices.has(name)) {
			seenServices.add(name);
			services.push({ name, technology });
		}
	}

	return { symbols, relations, envvars, services };
}

export async function analyzeTypeScript(projectRoot: string): Promise<AnalysisResult> {
	const tsConfigPath = join(projectRoot, 'tsconfig.json');
	const hasTsConfig = existsSync(tsConfigPath);

	const project = new Project(
		hasTsConfig
			? { tsConfigFilePath: tsConfigPath, skipAddingFilesFromTsConfig: false }
			: {
					compilerOptions: {
						target: ts.ScriptTarget.ES2022,
						module: ts.ModuleKind.NodeNext,
						moduleResolution: ts.ModuleResolutionKind.NodeNext,
						strict: false,
						allowJs: true,
					},
				}
	);

	if (!hasTsConfig) {
		const glob = await import('fast-glob');
		const files = await glob.default(['**/*.ts', '**/*.tsx', '**/*.js'], {
			cwd: projectRoot,
			ignore: ['**/node_modules/**', '**/.svelte-kit/**', '**/dist/**', '**/build/**'],
			absolute: true,
		});
		project.addSourceFilesAtPaths(files);
	}

	const files: FileInfo[] = [];
	const symbols: SymbolInfo[] = [];
	const relations: RelationInfo[] = [];
	const envvars: EnvVarInfo[] = [];
	const services: ServiceInfo[] = [];
	const seenServices = new Set<string>();
	const seenEnvVars = new Set<string>();

	for (const sf of project.getSourceFiles()) {
		const absPath = sf.getFilePath();
		if (absPath.includes('node_modules') || absPath.includes('.svelte-kit')) continue;

		const relPath = relative(projectRoot, absPath);
		const text = sf.getFullText();
		files.push({ path: relPath, language: 'typescript', loc: countLines(text), test: isTestFile(relPath) });

		const analysis = analyzeSourceFile(sf, projectRoot);
		symbols.push(...analysis.symbols);
		relations.push(...analysis.relations);
		for (const ev of analysis.envvars) {
			if (!seenEnvVars.has(ev.name)) { seenEnvVars.add(ev.name); envvars.push(ev); }
		}
		for (const svc of analysis.services) {
			if (!seenServices.has(svc.name)) { seenServices.add(svc.name); services.push(svc); }
		}
	}

	// ── npm dependencies from package.json
	const dependencies: AnalysisResult['dependencies'] = [];
	const pkgPath = join(projectRoot, 'package.json');
	if (existsSync(pkgPath)) {
		const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
		for (const [name, version] of Object.entries({ ...pkg.dependencies, ...pkg.devDependencies })) {
			dependencies.push({ name, version: version.replace(/^\^|^~/, ''), ecosystem: 'npm' });
		}
	}

	return { files, symbols, relations, dependencies, services, envvars };
}
