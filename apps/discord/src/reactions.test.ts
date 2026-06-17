import { describe, it, expect } from 'vitest';

import { reactionFor } from './reactions.js';

describe('reactionFor', () => {
	it('maps each ingest status to its acknowledgement emoji', () => {
		expect(reactionFor('ingested')).toBe('✅');
		expect(reactionFor('duplicate')).toBe('♻️');
		expect(reactionFor('unavailable')).toBe('⚠️');
		expect(reactionFor('error')).toBe('❌');
	});

	it('returns null for unsupported links (left unflagged)', () => {
		expect(reactionFor('unsupported')).toBeNull();
	});
});
