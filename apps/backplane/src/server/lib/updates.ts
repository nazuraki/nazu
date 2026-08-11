export interface ImageRef {
	/** Registry host, e.g. `ghcr.io` or `registry-1.docker.io`. */
	registry: string;
	/** Repository path, e.g. `nazuraki/nazu-web` or `library/postgres`. */
	repo: string;
	tag: string;
}

export interface ImageUpdate {
	image: string;
	remoteDigest: string | null;
	runningDigest: string | null;
	updateAvailable: boolean;
	error?: string;
}

const MANIFEST_ACCEPT = [
	'application/vnd.oci.image.index.v1+json',
	'application/vnd.docker.distribution.manifest.list.v2+json',
	'application/vnd.oci.image.manifest.v1+json',
	'application/vnd.docker.distribution.manifest.v2+json',
].join(', ');

export function parseImageRef(ref: string): ImageRef {
	let rest = ref;
	let registry = 'registry-1.docker.io';
	const firstSeg = rest.split('/')[0];
	if (rest.includes('/') && (firstSeg.includes('.') || firstSeg.includes(':') || firstSeg === 'localhost')) {
		registry = firstSeg;
		rest = rest.slice(firstSeg.length + 1);
	}
	let tag = 'latest';
	const lastColon = rest.lastIndexOf(':');
	if (lastColon > rest.lastIndexOf('/')) {
		tag = rest.slice(lastColon + 1);
		rest = rest.slice(0, lastColon);
	}
	if (registry === 'registry-1.docker.io' && !rest.includes('/')) rest = `library/${rest}`;
	return { registry, repo: rest, tag };
}

/** Normalized `host/repo` key used to match a ref against running digests. */
export function imageRepoKey(ref: string): string {
	const { registry, repo } = parseImageRef(ref);
	return `${registry}/${repo}`;
}

/**
 * Resolve the current manifest digest for an image ref via the OCI distribution
 * API (anonymous token flow — public images). Returns the `docker-content-digest`.
 */
export async function fetchRemoteDigest(ref: string, fetchFn: typeof fetch = fetch): Promise<string> {
	const { registry, repo, tag } = parseImageRef(ref);
	const url = `https://${registry}/v2/${repo}/manifests/${tag}`;

	let res = await fetchFn(url, { method: 'HEAD', headers: { Accept: MANIFEST_ACCEPT } });
	if (res.status === 401) {
		const challenge = res.headers.get('www-authenticate') ?? '';
		const token = await fetchToken(challenge, repo, fetchFn);
		res = await fetchFn(url, {
			method: 'HEAD',
			headers: { Accept: MANIFEST_ACCEPT, Authorization: `Bearer ${token}` },
		});
	}
	if (!res.ok) throw new Error(`manifest HEAD failed: HTTP ${res.status} for ${ref}`);

	const digest = res.headers.get('docker-content-digest');
	if (!digest) throw new Error(`no docker-content-digest header for ${ref}`);
	return digest;
}

async function fetchToken(challenge: string, repo: string, fetchFn: typeof fetch): Promise<string> {
	const params = new Map<string, string>();
	for (const [, k, v] of challenge.matchAll(/(\w+)="([^"]*)"/g)) params.set(k, v);
	const realm = params.get('realm');
	if (!realm) throw new Error(`unparseable auth challenge: ${challenge}`);

	const url = new URL(realm);
	if (params.get('service')) url.searchParams.set('service', params.get('service')!);
	url.searchParams.set('scope', params.get('scope') ?? `repository:${repo}:pull`);

	const res = await fetchFn(url.toString());
	if (!res.ok) throw new Error(`token fetch failed: HTTP ${res.status}`);
	const body = (await res.json()) as { token?: string; access_token?: string };
	const token = body.token ?? body.access_token;
	if (!token) throw new Error('token response had no token');
	return token;
}

/**
 * Compare each image ref's remote digest against what's running.
 * `runningDigests` maps a normalized `host/repo` key to the running digest.
 */
export async function checkImages(
	images: string[],
	runningDigests: Map<string, string>,
	fetchFn: typeof fetch = fetch,
): Promise<ImageUpdate[]> {
	return Promise.all(
		images.map(async (image) => {
			const runningDigest = runningDigests.get(imageRepoKey(image)) ?? null;
			try {
				const remoteDigest = await fetchRemoteDigest(image, fetchFn);
				return {
					image,
					remoteDigest,
					runningDigest,
					updateAvailable: runningDigest !== null && remoteDigest !== runningDigest,
				};
			} catch (err) {
				return {
					image,
					remoteDigest: null,
					runningDigest,
					updateAvailable: false,
					error: err instanceof Error ? err.message : String(err),
				};
			}
		}),
	);
}
