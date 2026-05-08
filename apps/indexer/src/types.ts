export type SymbolKind =
	| 'function'
	| 'method'
	| 'class'
	| 'interface'
	| 'type'
	| 'enum'
	| 'constant'
	| 'variable'
	| 'struct'
	| 'trait'
	| 'impl'
	| 'macro'
	| 'component'
	| 'route'
	| 'table';

export type Ecosystem = 'npm' | 'cargo' | 'pypi' | 'gomod';

export type RelKind = 'CALLS' | 'IMPORTS' | 'EXTENDS' | 'IMPLEMENTS' | 'DEPENDS_ON' | 'CONNECTS_TO' | 'READS_ENV';

export interface FileInfo {
	path: string;
	language: string;
	loc: number;
	test: boolean;
}

export interface SymbolInfo {
	fqn: string; // "{relative_path}::{name}" — graph node key
	name: string;
	kind: SymbolKind;
	signature: string;
	doc: string;
	file: string;
	line: number;
	exported: boolean;
}

export interface RelationInfo {
	fromFqn: string;
	toFqn: string;
	rel: RelKind;
}

export interface DependencyInfo {
	name: string;
	version: string;
	ecosystem: Ecosystem;
}

export interface ServiceInfo {
	name: string;
	technology: string;
}

export interface EnvVarInfo {
	name: string;
	purpose: string;
}

export interface AnalysisResult {
	files: FileInfo[];
	symbols: SymbolInfo[];
	relations: RelationInfo[];
	dependencies: DependencyInfo[];
	services: ServiceInfo[];
	envvars: EnvVarInfo[];
}
