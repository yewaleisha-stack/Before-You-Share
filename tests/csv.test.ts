import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { detect } from '../src/engine/resolve';
import { redact } from '../src/engine/redact';

/** Minimal RFC 4180 parser, test-only. */
function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\r' && text[i + 1] === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; i++; }
    else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

const input = readFileSync(new URL('./fixtures/roundtrip.csv', import.meta.url), 'utf8');

describe('T20 CSV round trip', () => {
  const d = detect(input);
  for (const mode of ['full', 'partial', 'pseudo'] as const) {
    const r = redact(input, d.matches, mode, d.rejected);
    it(`${mode}: (a) same shape`, () => {
      const a = parseCSV(input);
      const b = parseCSV(r.output);
      expect(b.length).toBe(a.length);
      a.forEach((row, i) => expect(b[i].length).toBe(row.length));
    });
    it(`${mode}: (b) cells without PII are identical`, () => {
      const a = parseCSV(input);
      const b = parseCSV(r.output);
      const has = (s: string) => detect(s).matches.length > 0;
      let checked = 0;
      a.forEach((row, i) => row.forEach((cell, j) => {
        if (!has(cell)) { expect(b[i][j]).toBe(cell); checked++; }
      }));
      expect(checked > 10).toBe(true);
    });
    it(`${mode}: (c) text outside spans is byte-identical`, () => {
      let pos = 0;
      for (const s of r.segments) {
        if (s.kind !== 'match') {
          const len = s.src[1] - s.src[0];
          expect(r.output.slice(pos, pos + len)).toBe(input.slice(s.src[0], s.src[1]));
          pos += len;
        } else pos += s.out.length;
      }
      expect(r.output).toContain('\r\n');
      expect(r.output).toContain('007');
    });
  }
  it('finds PII in several cells', () => expect(d.matches.length >= 6).toBe(true));
});
