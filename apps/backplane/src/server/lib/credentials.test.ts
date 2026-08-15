import { readFileSync, statSync } from 'node:fs';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { gitCredentials, registryAuthHeader, writeDockerConfig } from './credentials.js';

describe('gitCredentials', () => {
	it('returns undefined without a token', () => {
		expect(gitCredentials(undefined)).toBeUndefined();
		expect(gitCredentials('')).toBeUndefined();
	});

	it('scopes the helper to github.com and keeps the token out of argv', () => {
		const creds = gitCredentials('ghp_secret')!;
		expect(creds.args[0]).toBe('-c');
		expect(creds.args[1]).toContain('credential.https://github.com.helper=');
		expect(creds.args.join(' ')).not.toContain('ghp_secret');
		expect(creds.env).toEqual({ BACKPLANE_GITHUB_TOKEN: 'ghp_secret' });
	});
});

describe('registryAuthHeader', () => {
	it('produces Basic auth for ghcr.io only', () => {
		const header = registryAuthHeader('ghcr.io', 'ghp_secret')!;
		expect(header).toMatch(/^Basic /);
		expect(Buffer.from(header.slice(6), 'base64').toString()).toBe('x-access-token:ghp_secret');
	});

	it('returns undefined for other registries or no token', () => {
		expect(registryAuthHeader('registry-1.docker.io', 'ghp_secret')).toBeUndefined();
		expect(registryAuthHeader('ghcr.io', undefined)).toBeUndefined();
	});
});

describe('writeDockerConfig', () => {
	it('returns undefined without a token', () => {
		expect(writeDockerConfig('/nowhere', undefined)).toBeUndefined();
	});

	it('writes a 0600 config.json with ghcr auth and returns DOCKER_CONFIG', () => {
		const dataDir = mkdtempSync(join(tmpdir(), 'bp-creds-'));
		const env = writeDockerConfig(dataDir, 'ghp_secret')!;
		const dir = env.DOCKER_CONFIG;
		expect(dir).toBe(join(dataDir, 'docker-config'));

		const path = join(dir, 'config.json');
		const config = JSON.parse(readFileSync(path, 'utf8')) as {
			auths: Record<string, { auth: string }>;
		};
		expect(Buffer.from(config.auths['ghcr.io'].auth, 'base64').toString()).toBe(
			'x-access-token:ghp_secret',
		);
		expect(statSync(path).mode & 0o777).toBe(0o600);
	});
});
