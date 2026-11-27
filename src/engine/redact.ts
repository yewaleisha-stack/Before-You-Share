import type { EntityType, Match, Mode, RedactionResult, Rejected, Segment } from './types';
import { parseIPv6 } from './validate';

export const ALIAS_PREFIX: Record<EntityType, string> = {
  EMAIL: 'EMAIL',
  PHONE: 'PHONE',
  IP: 'IP',
  PAN: 'PAN',
  AADHAAR: 'AADHAAR',
  CARD: 'CARD',
};

/** Characters a replacement may never contain (CSV safety invariant 2). */
const UNSAFE_OUT = /[,;\t|"'\r\n]/;

/** Normalized key: values that are definitely the same thing share a key. */
export function normalize(type: EntityType, raw: string): string {
  switch (type) {
    case 'EMAIL':
      return raw.toLowerCase();
    case 'PHONE': {
      const digits = raw.replace(/\D/g, '');
      if (raw.startsWith('+') && !raw.startsWith('+91')) return `+${digits}`;
      return digits.slice(-10);
    }
    case 'CARD':
    case 'AADHAAR':
      return raw.replace(/\D/g, '');
    case 'PAN':
      return raw.toUpperCase();
    case 'IP': {
      if (raw.includes(':')) return (parseIPv6(raw) ?? [raw.toLowerCase()]).join(':');
      return raw;
    }
  }
}

/** Masks every digit except the last `keep`, keeping separators. */
function maskDigits(s: string, keep = 4): string {
  const total = s.replace(/\D/g, '').length;
  let seen = 0;
  return s.replace(/\d/g, (d) => (++seen > total - keep ? d : 'X'));
}

export function partialMask(type: EntityType, raw: string): string {
  switch (type) {
    case 'EMAIL': {
      const at = raw.indexOf('@');
      const local = raw.slice(0, at);
      const domain = raw.slice(at + 1);
      return local.length <= 2 ? `***@${domain}` : `${local[0]}***@${domain}`;
    }
    case 'PHONE': {
      const m = /^(\+91[ -]?|91(?=[6-9]\d{9}$)|0(?=[6-9]))/.exec(raw);
      const prefix = m ? m[0] : raw.startsWith('+') ? '+' : '';
      return prefix + maskDigits(raw.slice(prefix.length));
    }
    case 'CARD':
    case 'AADHAAR':
      return maskDigits(raw);
    case 'PAN':
      return 'XXXXXX' + raw.slice(-4);
    case 'IP': {
      if (raw.includes(':')) {
        const g = parseIPv6(raw) ?? [];
        return `${g[0]}:${g[1]}:x:x:x:x:x:x`;
      }
      const o = raw.split('.');
      return `${o[0]}.${o[1]}.x.x`;
    }
  }
}

export function redact(text: string, matches: Match[], mode: Mode, rejected: Rejected[] = []): RedactionResult {
  const aliasByKey = new Map<string, string>();
  const counters = new Map<string, number>();
  const aliasCounts = new Map<string, number>();
  const segments: Segment[] = [];

  // Merge rejected runs into the segment list so the UI can mark them.
  type Piece = { start: number; end: number; m?: Match; r?: Rejected };
  const pieces: Piece[] = [
    ...matches.map((m) => ({ start: m.start, end: m.end, m })),
    ...rejected.map((r) => ({ start: r.start, end: r.end, r })),
  ].sort((a, b) => a.start - b.start);

  let pos = 0;
  for (const p of pieces) {
    if (p.start > pos) segments.push({ kind: 'text', src: [pos, p.start] });
    if (p.r) {
      segments.push({ kind: 'rejected', src: [p.start, p.end], reason: p.r.reason });
    } else if (p.m) {
      const m = p.m;
      let out: string;
      let alias: string | undefined;
      if (mode === 'full') out = '[REDACTED]';
      else if (mode === 'partial') out = partialMask(m.type, m.raw);
      else {
        const prefix = ALIAS_PREFIX[m.type];
        const key = `${m.type}|${normalize(m.type, m.raw)}`;
        alias = aliasByKey.get(key);
        if (!alias) {
          const n = (counters.get(prefix) ?? 0) + 1;
          counters.set(prefix, n);
          alias = `${prefix}_${String(n).padStart(2, '0')}`;
          aliasByKey.set(key, alias);
        }
        aliasCounts.set(alias, (aliasCounts.get(alias) ?? 0) + 1);
        out = alias;
      }
      if (UNSAFE_OUT.test(out)) throw new Error('Invariant: replacement contains a delimiter or quote');
      if (/^[=+\-@]/.test(out) && out[0] !== m.raw[0]) throw new Error('Invariant: replacement adds a formula prefix');
      segments.push({ kind: 'match', id: m.id, type: m.type, src: [m.start, m.end], out, alias });
    }
    pos = p.end;
  }
  if (pos < text.length) segments.push({ kind: 'text', src: [pos, text.length] });

  const output = segments.map((s) => (s.kind === 'match' ? s.out : text.slice(s.src[0], s.src[1]))).join('');
  return { segments, output, aliasCounts };
}
