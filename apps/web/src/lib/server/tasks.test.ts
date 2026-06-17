import { describe, it, expect, vi } from 'vitest';

// tasks.ts imports db.js, which transitively pulls in `$env/dynamic/private`
// (unavailable in the standalone vitest env). Stub it so the pure
// `derivePriority` helper can be exercised in isolation.
vi.mock('./db.js', () => ({ getSql: vi.fn() }));

import { derivePriority } from './tasks';

const NOW = new Date('2026-06-17T12:00:00Z');

describe('derivePriority', () => {
	it('flags blocked tasks high regardless of due date', () => {
		expect(derivePriority({ status: 'blocked', due_date: null }, NOW)).toBe('high');
		expect(derivePriority({ status: 'blocked', due_date: '2099-01-01' }, NOW)).toBe('high');
	});

	it('flags overdue tasks high', () => {
		expect(derivePriority({ status: 'pending', due_date: '2026-06-16' }, NOW)).toBe('high');
	});

	it('flags tasks due today as medium (not yet overdue)', () => {
		expect(derivePriority({ status: 'pending', due_date: '2026-06-17' }, NOW)).toBe('medium');
	});

	it('flags tasks due within a week as medium', () => {
		expect(derivePriority({ status: 'pending', due_date: '2026-06-20' }, NOW)).toBe('medium');
	});

	it('treats the 7-day boundary as medium but the day after as null', () => {
		expect(derivePriority({ status: 'pending', due_date: '2026-06-24' }, NOW)).toBe('medium');
		expect(derivePriority({ status: 'pending', due_date: '2026-06-25' }, NOW)).toBeNull();
	});

	it('returns null for far-future or undated pending tasks', () => {
		expect(derivePriority({ status: 'pending', due_date: '2026-08-01' }, NOW)).toBeNull();
		expect(derivePriority({ status: 'pending', due_date: null }, NOW)).toBeNull();
	});

	it('accepts Date due values (as Postgres DATE columns return)', () => {
		expect(derivePriority({ status: 'pending', due_date: new Date('2026-06-16') }, NOW)).toBe('high');
	});

	it('returns null for an unparseable due date', () => {
		expect(derivePriority({ status: 'pending', due_date: 'not-a-date' }, NOW)).toBeNull();
	});
});
