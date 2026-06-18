import type { IngestStatus } from './ingest.js';

/**
 * Emoji that acknowledges an ingest outcome on the source message. `null` means
 * "react with nothing" — an unsupported link (someone's unrelated URL) is left
 * untouched rather than flagged.
 */
export function reactionFor(status: IngestStatus): string | null {
	switch (status) {
		case 'ingested':
			return '✅';
		case 'duplicate':
			return '♻️';
		case 'unavailable':
			return '⚠️';
		case 'error':
			return '❌';
		case 'unsupported':
			return null;
	}
}
