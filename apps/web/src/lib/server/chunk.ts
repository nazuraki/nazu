/** A passage-sized slice of a document body, ready to persist into `document_chunks`. */
export interface Chunk {
	/** 0-based position within the document. Contiguous. */
	index: number;
	/** The chunk text (a paragraph or few, possibly prefixed with overlap context). */
	content: string;
	wordCount: number;
}

// Chunk sizing, in words — a dependency-free proxy for tokens (~0.75 words/token).
// TARGET is the soft size we pack toward: a chunk closes once adding the next
// paragraph would exceed it. MAX is the hard ceiling on a single chunk. OVERLAP is
// how many trailing words of one chunk are carried as context into the next, so a
// passage straddling a boundary still matches (and, later, embeds — #53) with its
// surrounding context.
export const TARGET_WORDS = 220;
export const MAX_WORDS = 350;
export const OVERLAP_WORDS = 40;

// Paragraphs longer than this are hard-split, so that even after an overlap seed is
// prepended a chunk never exceeds MAX_WORDS (seed ≤ OVERLAP + unit ≤ ceiling = MAX).
const UNIT_CEILING = MAX_WORDS - OVERLAP_WORDS;

/** Whitespace-tokenized word list. */
function words(text: string): string[] {
	return text.trim().split(/\s+/).filter(Boolean);
}

export function countWords(text: string): number {
	return words(text).length;
}

/** The last `n` words of a text, joined back into a string. */
function lastWords(text: string, n: number): string {
	const w = words(text);
	return w.slice(Math.max(0, w.length - n)).join(' ');
}

/**
 * Split a document body into passage-sized {@link Chunk}s for indexing and recall.
 *
 * Strategy: break on blank-line (paragraph / markdown-block) boundaries, hard-split
 * any block too large to fit a chunk, then greedily pack blocks up to TARGET_WORDS.
 * Consecutive chunks share an OVERLAP_WORDS-word seed for context continuity. Every
 * chunk is `<= MAX_WORDS`; a body that fits in one chunk yields exactly one chunk
 * (no overlap, content equal to the normalized body).
 */
export function chunkDocument(content: string): Chunk[] {
	const normalized = content.replace(/\r\n?/g, '\n').trim();
	if (!normalized) return [];

	// Blocks: paragraphs / markdown blocks. Oversized ones are hard-split into
	// word windows so a single huge block can't blow past MAX_WORDS.
	const units: string[] = [];
	for (const block of normalized.split(/\n\s*\n+/)) {
		const w = words(block);
		if (w.length === 0) continue;
		if (w.length <= UNIT_CEILING) {
			units.push(block.trim());
		} else {
			for (let i = 0; i < w.length; i += UNIT_CEILING) {
				units.push(w.slice(i, i + UNIT_CEILING).join(' '));
			}
		}
	}
	if (units.length === 0) return [];

	const chunks: Chunk[] = [];
	let parts: string[] = []; // unit texts (and an optional leading overlap seed) for the chunk being built
	let wc = 0; // word count of `parts`
	let pendingSeed = ''; // overlap carried from the just-closed chunk into the next

	const flush = (): void => {
		if (parts.length === 0) return;
		const text = parts.join('\n\n');
		chunks.push({ index: chunks.length, content: text, wordCount: wc });
		pendingSeed = lastWords(text, OVERLAP_WORDS); // seed the next chunk (discarded if none follows)
		parts = [];
		wc = 0;
	};

	for (const unit of units) {
		const uw = words(unit).length;
		// Close the current chunk before it overflows the soft target (but always
		// keep at least one real unit per chunk — never emit a seed-only chunk).
		if (parts.length > 0 && wc + uw > TARGET_WORDS) flush();
		// Starting a fresh chunk: lay down the overlap seed as leading context.
		if (parts.length === 0 && pendingSeed) {
			parts.push(pendingSeed);
			wc += words(pendingSeed).length;
			pendingSeed = '';
		}
		parts.push(unit);
		wc += uw;
	}
	flush();

	return chunks;
}
