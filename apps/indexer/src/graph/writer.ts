import { runInGraph, escape, toCypherValue } from './client.js';
import type { AnalysisResult, FileInfo, SymbolInfo, RelationInfo, DependencyInfo, ServiceInfo, EnvVarInfo } from '../types.js';

const CONCURRENCY = 50;

async function batchMerge(graph: string, items: unknown[], cypher: (item: unknown) => string) {
	const stmts = items.map(cypher).filter((s) => s.trim());
	for (let i = 0; i < stmts.length; i += CONCURRENCY) {
		await Promise.all(stmts.slice(i, i + CONCURRENCY).map((s) => runInGraph(graph, s)));
	}
}

export async function writeProject(graph: string, name: string, path: string, languages: string[]) {
	await runInGraph(graph, `
		MERGE (p:Project {name: '${escape(name)}'})
		SET p.path = '${escape(path)}',
		    p.languages = ${toCypherValue(languages)},
		    p.last_indexed = ${Date.now()}
	`);
}

export async function writeFiles(graph: string, files: FileInfo[]) {
	await batchMerge(graph, files, (item) => {
		const f = item as FileInfo;
		return `MERGE (n:File {path: '${escape(f.path)}'}) SET n.language = '${escape(f.language)}', n.loc = ${f.loc}, n.test = ${f.test}`;
	});
}

export async function writeSymbols(graph: string, symbols: SymbolInfo[]) {
	await batchMerge(graph, symbols, (item) => {
		const s = item as SymbolInfo;
		return `MERGE (n:Symbol {fqn: '${escape(s.fqn)}'}) SET n.name = '${escape(s.name)}', n.kind = '${escape(s.kind)}', n.signature = '${escape(s.signature)}', n.doc = '${escape(s.doc)}', n.file = '${escape(s.file)}', n.line = ${s.line}, n.exported = ${s.exported}`;
	});
}

export async function writeRelations(graph: string, relations: RelationInfo[]) {
	// DEFINES: File -> Symbol
	const defines = relations.filter((r) => r.rel === 'CALLS' || r.rel === 'IMPORTS' || r.rel === 'EXTENDS' || r.rel === 'IMPLEMENTS');
	const fileSymbol = relations.filter((r) => r.rel === 'DEPENDS_ON' || r.rel === 'CONNECTS_TO' || r.rel === 'READS_ENV');

	await batchMerge(graph, defines, (item) => {
		const r = item as RelationInfo;
		return `MATCH (a:Symbol {fqn: '${escape(r.fromFqn)}'}), (b:Symbol {fqn: '${escape(r.toFqn)}'}) MERGE (a)-[:${r.rel}]->(b)`;
	});

	// File -[:DEPENDS_ON]-> Dependency, Symbol -[:CONNECTS_TO]-> Service, Symbol -[:READS_ENV]-> EnvVar
	await batchMerge(graph, fileSymbol, (item) => {
		const r = item as RelationInfo;
		if (r.rel === 'DEPENDS_ON') {
			return `MATCH (f:File {path: '${escape(r.fromFqn)}'}), (d:Dependency {name: '${escape(r.toFqn)}'}) MERGE (f)-[:DEPENDS_ON]->(d)`;
		}
		if (r.rel === 'CONNECTS_TO') {
			return `MATCH (s:Symbol {fqn: '${escape(r.fromFqn)}'}), (svc:Service {name: '${escape(r.toFqn)}'}) MERGE (s)-[:CONNECTS_TO]->(svc)`;
		}
		if (r.rel === 'READS_ENV') {
			return `MATCH (s:Symbol {fqn: '${escape(r.fromFqn)}'}), (e:EnvVar {name: '${escape(r.toFqn)}'}) MERGE (s)-[:READS_ENV]->(e)`;
		}
		return '';
	});
}

export async function writeDependencies(graph: string, deps: DependencyInfo[]) {
	await batchMerge(graph, deps, (item) => {
		const d = item as DependencyInfo;
		return `MERGE (n:Dependency {name: '${escape(d.name)}'}) SET n.version = '${escape(d.version)}', n.ecosystem = '${escape(d.ecosystem)}'`;
	});
}

export async function writeServices(graph: string, services: ServiceInfo[]) {
	await batchMerge(graph, services, (item) => {
		const s = item as ServiceInfo;
		return `MERGE (n:Service {name: '${escape(s.name)}'}) SET n.technology = '${escape(s.technology)}'`;
	});
}

export async function writeEnvVars(graph: string, envvars: EnvVarInfo[]) {
	await batchMerge(graph, envvars, (item) => {
		const e = item as EnvVarInfo;
		return `MERGE (n:EnvVar {name: '${escape(e.name)}'}) SET n.purpose = '${escape(e.purpose)}'`;
	});
}

export async function writeAll(graph: string, result: AnalysisResult) {
	await writeFiles(graph, result.files);
	await writeDependencies(graph, result.dependencies);
	await writeServices(graph, result.services);
	await writeEnvVars(graph, result.envvars);
	await writeSymbols(graph, result.symbols);
	await writeRelations(graph, result.relations);
}
