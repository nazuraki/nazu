import { describe, it, expect } from 'vitest';

import { chunkDocument, countWords, MAX_WORDS, OVERLAP_WORDS, TARGET_WORDS } from './chunk';

/** Whitespace word list — mirrors the module's internal tokenization for assertions. */
const words = (t: string): string[] => t.trim().split(/\s+/).filter(Boolean);
const firstWords = (t: string, n: number): string => words(t).slice(0, n).join(' ');
const lastWords = (t: string, n: number): string => words(t).slice(-n).join(' ');

/** A run of globally-unique words `w<from>..w<to-1>`, so overlap is unambiguous. */
const wordRun = (from: number, to: number): string =>
	Array.from({ length: to - from }, (_, i) => `w${from + i}`).join(' ');

describe('countWords', () => {
	it('counts whitespace-separated tokens, ignoring extra whitespace', () => {
		expect(countWords('  a  b\tc\n d ')).toBe(4);
		expect(countWords('')).toBe(0);
		expect(countWords('   ')).toBe(0);
	});
});

describe('chunkDocument', () => {
	it('returns [] for empty or whitespace-only content', () => {
		expect(chunkDocument('')).toEqual([]);
		expect(chunkDocument('   \n\n  \t ')).toEqual([]);
	});

	it('returns a single chunk equal to the body when it fits', () => {
		const body = 'Hello world. This is a short note.';
		const chunks = chunkDocument(body);
		expect(chunks).toHaveLength(1);
		expect(chunks[0]).toMatchObject({ index: 0, content: body, wordCount: 7 });
	});

	it('splits a multi-paragraph body at paragraph boundaries', () => {
		const para1 = wordRun(0, 150);
		const para2 = wordRun(150, 300);
		const para3 = wordRun(300, 450);
		const chunks = chunkDocument([para1, para2, para3].join('\n\n'));

		expect(chunks.length).toBeGreaterThan(1);
		// Each original paragraph survives whole inside some chunk (no mid-paragraph cut).
		for (const para of [para1, para2, para3]) {
			expect(chunks.some((c) => c.content.includes(para))).toBe(true);
		}
	});

	it('assigns contiguous 0-based indices and keeps every chunk within MAX_WORDS', () => {
		const paras = Array.from({ length: 10 }, (_, i) => wordRun(i * 100, i * 100 + 100));
		const chunks = chunkDocument(paras.join('\n\n'));

		expect(chunks.length).toBeGreaterThan(1);
		expect(chunks.map((c) => c.index)).toEqual(chunks.map((_, i) => i));
		for (const c of chunks) {
			expect(c.wordCount).toBeLessThanOrEqual(MAX_WORDS);
			expect(c.wordCount).toBe(countWords(c.content));
		}
	});

	it('carries an overlap seed from each chunk into the next', () => {
		const chunks = chunkDocument([wordRun(0, 150), wordRun(150, 300), wordRun(300, 450)].join('\n\n'));
		expect(chunks.length).toBeGreaterThan(1);
		for (let i = 0; i < chunks.length - 1; i++) {
			// The next chunk begins with the previous chunk's trailing OVERLAP_WORDS.
			expect(firstWords(chunks[i + 1].content, OVERLAP_WORDS)).toBe(
				lastWords(chunks[i].content, OVERLAP_WORDS)
			);
		}
	});

	it('hard-splits a single oversized paragraph (no blank-line boundaries)', () => {
		const chunks = chunkDocument(wordRun(0, 800));
		expect(chunks.length).toBeGreaterThan(1);
		for (const c of chunks) {
			expect(c.wordCount).toBeLessThanOrEqual(MAX_WORDS);
		}
		// All source words are covered across the chunks (overlap may repeat some).
		const seen = new Set(chunks.flatMap((c) => words(c.content)));
		for (let i = 0; i < 800; i++) expect(seen.has(`w${i}`)).toBe(true);
	});

	it('keeps fresh content packed toward TARGET_WORDS', () => {
		// Small paragraphs should accumulate, not emit one tiny chunk per paragraph.
		const paras = Array.from({ length: 12 }, (_, i) => wordRun(i * 30, i * 30 + 30));
		const chunks = chunkDocument(paras.join('\n\n'));
		// 12 × 30 = 360 words; at ~TARGET_WORDS per chunk this is a small number of chunks.
		expect(chunks.length).toBeLessThan(paras.length);
		expect(chunks.length).toBeGreaterThan(1);
		expect(TARGET_WORDS).toBeLessThan(MAX_WORDS); // sanity: soft target below hard cap
	});
});
