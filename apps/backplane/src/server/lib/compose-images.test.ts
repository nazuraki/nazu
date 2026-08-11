import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

// Guards drift between the CI publish matrix (publish-images.yml) and the
// deployable compose files: server deploys run `compose pull` + `up -d` (never
// `--build`), so every buildable service must also pin its published image.
// The compose files are simple 2-space-indented YAML; a targeted line scan
// avoids pulling a YAML parser into the workspace.

const repoRoot = new URL('../../../../../', import.meta.url);

function read(rel: string): string {
	return readFileSync(new URL(rel, repoRoot), 'utf8');
}

interface ComposeService {
	name: string;
	image: string | null;
	hasBuild: boolean;
}

/** Extract each service's `image:` / `build:` from a 2-space-indented compose file. */
export function parseComposeServices(yaml: string): ComposeService[] {
	const services: ComposeService[] = [];
	let inServices = false;
	let current: ComposeService | null = null;
	for (const line of yaml.split('\n')) {
		if (/^\S/.test(line)) {
			inServices = line.startsWith('services:');
			current = null;
			continue;
		}
		if (!inServices) continue;
		const svc = /^ {2}([\w-]+):\s*$/.exec(line);
		if (svc) {
			current = { name: svc[1], image: null, hasBuild: false };
			services.push(current);
			continue;
		}
		if (!current) continue;
		const image = /^ {4}image:\s*(\S+)/.exec(line);
		if (image) current.image = image[1];
		if (/^ {4}build:/.test(line)) current.hasBuild = true;
	}
	return services;
}

function publishedImages(): string[] {
	const workflow = read('.github/workflows/publish-images.yml');
	return [...workflow.matchAll(/-\s+image:\s*(\S+)/g)].map((m) => m[1]);
}

const COMPOSE_FILES = ['docker-compose.yml', 'apps/backplane/docker-compose.yml'];

describe('publish matrix ↔ compose image consistency', () => {
	const allServices = COMPOSE_FILES.flatMap((f) => parseComposeServices(read(f)));

	it('parses the expected buildable services', () => {
		const buildable = allServices.filter((s) => s.hasBuild).map((s) => s.name);
		expect(buildable.sort()).toEqual(['backplane', 'discord', 'graphiti', 'web']);
	});

	it('references every published image from exactly one compose service', () => {
		const images = publishedImages();
		expect(images.length).toBeGreaterThan(0);
		for (const name of images) {
			const users = allServices.filter((s) => s.image === `ghcr.io/nazuraki/${name}:latest`);
			expect(users, `ghcr.io/nazuraki/${name}:latest`).toHaveLength(1);
		}
	});

	it('pins a published image on every buildable service (deploys never --build)', () => {
		for (const svc of allServices.filter((s) => s.hasBuild)) {
			expect(svc.image, svc.name).toMatch(/^ghcr\.io\/nazuraki\/nazu-[\w-]+:latest$/);
		}
	});
});
