import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Optional GitHub token (`BACKPLANE_GITHUB_TOKEN`) wiring for private repos and
 * private GHCR images. Everything here degrades to the anonymous/public-only
 * behavior when no token is configured.
 */

/** Extra git invocation pieces: `-c` config args plus child-process env. */
export interface GitCredentials {
	args: string[];
	env: Record<string, string>;
}

// The helper shells out inside git; keep it a fixed string (no interpolation)
// and read the token from the environment so it never appears in argv.
const GIT_HELPER =
	'!f() { echo username=x-access-token; echo "password=$BACKPLANE_GITHUB_TOKEN"; }; f';

/**
 * Git config injecting the token for github.com HTTPS remotes only, so
 * credentials are never offered to other hosts.
 */
export function gitCredentials(token: string | undefined): GitCredentials | undefined {
	if (!token) return undefined;
	return {
		args: ['-c', `credential.https://github.com.helper=${GIT_HELPER}`],
		env: { BACKPLANE_GITHUB_TOKEN: token },
	};
}

/** `Authorization` header for a registry's OCI token exchange; ghcr.io only. */
export function registryAuthHeader(registry: string, token: string | undefined): string | undefined {
	if (!token || registry !== 'ghcr.io') return undefined;
	return `Basic ${Buffer.from(`x-access-token:${token}`).toString('base64')}`;
}

/**
 * Write a docker client config with ghcr.io auth under `dataDir` and return
 * the `DOCKER_CONFIG` env pointing at it, so `docker compose pull` can fetch
 * private images without a host-level `docker login`.
 */
export function writeDockerConfig(
	dataDir: string,
	token: string | undefined,
): Record<string, string> | undefined {
	if (!token) return undefined;
	const dir = join(dataDir, 'docker-config');
	mkdirSync(dir, { recursive: true, mode: 0o700 });
	const config = {
		auths: {
			'ghcr.io': { auth: Buffer.from(`x-access-token:${token}`).toString('base64') },
		},
	};
	writeFileSync(join(dir, 'config.json'), JSON.stringify(config, null, '\t') + '\n', { mode: 0o600 });
	return { DOCKER_CONFIG: dir };
}
