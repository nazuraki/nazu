import { describe, expect, it } from 'vitest';

import { demuxLogBuffer } from './docker.js';

function frame(payload: string, stream = 1): Buffer {
	const body = Buffer.from(payload, 'utf8');
	const header = Buffer.alloc(8);
	header.writeUInt8(stream, 0);
	header.writeUInt32BE(body.length, 4);
	return Buffer.concat([header, body]);
}

describe('demuxLogBuffer', () => {
	it('extracts lines across stdout and stderr frames', () => {
		const buf = Buffer.concat([frame('hello\nworld\n', 1), frame('oops\n', 2)]);
		expect(demuxLogBuffer(buf)).toEqual(['hello', 'world', 'oops']);
	});

	it('ignores trailing partial frames and empty buffers', () => {
		const full = frame('done\n');
		const partial = frame('never-complete').subarray(0, 10);
		expect(demuxLogBuffer(Buffer.concat([full, partial]))).toEqual(['done']);
		expect(demuxLogBuffer(Buffer.alloc(0))).toEqual([]);
	});
});
