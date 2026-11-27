import type { Candidate, Detection, EntityType, Match, Rejected } from './types';
import { detectAll } from './detectors';
import { isAllZero, luhn } from './validate';

/** Tie-break order for equal-length spans. Lower is stronger. */
export const PRIORITY: Record<EntityType, number> = {
  EMAIL: 0,
  CARD: 1,
  IP: 2,
  AADHAAR: 3,
  PAN: 4,
  PHONE: 5,
};

const NUMERIC: ReadonlySet<EntityType> = new Set(['PHONE', 'AADHAAR', 'CARD']);

/** Characters a match span may contain (CSV safety invariant 1). */
export const SPAN_CHARS = /^[A-Za-z0-9 \-.@:+%_]+$/;

const overlaps = (a: { start: number; end: number }, b: { start: number; end: number }) =>
  a.start < b.end && b.start < a.end;

export function resolve(candidates: Candidate[]): Detection {
  const rejected: Rejected[] = [];
  const kept: Candidate[] = [];

  // 1. Card-shaped runs that fail Luhn (or are all zeros) are rejected.
  for (const c of candidates) {
    if (c.type !== 'CARD') continue;
    if (isAllZero(c.raw)) rejected.push({ start: c.start, end: c.end, raw: c.raw, reason: 'all-zero' });
    else if (!luhn(c.raw)) rejected.push({ start: c.start, end: c.end, raw: c.raw, reason: 'luhn' });
    else kept.push(c);
  }
  // 2. Numeric candidates overlapping a rejected run are discarded.
  for (const c of candidates) {
    if (c.type === 'CARD') continue;
    if (NUMERIC.has(c.type) && rejected.some((r) => overlaps(r, c))) continue;
    kept.push(c);
  }

  // 3. Longest first, then priority; accept non-overlapping.
  kept.sort((a, b) => b.end - b.start - (a.end - a.start) || PRIORITY[a.type] - PRIORITY[b.type] || a.start - b.start);
  const accepted: Candidate[] = [];
  for (const c of kept) {
    if (!accepted.some((a) => overlaps(a, c))) accepted.push(c);
  }

  // 4. Sort by position; one character belongs to at most one match.
  accepted.sort((a, b) => a.start - b.start);
  const matches: Match[] = accepted.map((c, id) => {
    if (!SPAN_CHARS.test(c.raw)) throw new Error(`Invariant: match span has unsafe characters: ${c.type}`);
    return { ...c, id };
  });

  // Rejected runs that ended up inside an accepted match (e.g. inside an email) are not reported.
  const visibleRejected = rejected
    .filter((r) => !matches.some((m) => overlaps(m, r)))
    .sort((a, b) => a.start - b.start);

  return { matches, rejected: visibleRejected };
}

export function detect(text: string): Detection {
  return resolve(detectAll(text));
}

export function countByType(matches: Match[]): Record<EntityType, number> {
  const counts: Record<EntityType, number> = { EMAIL: 0, PHONE: 0, IP: 0, PAN: 0, AADHAAR: 0, CARD: 0 };
  for (const m of matches) counts[m.type]++;
  return counts;
}
