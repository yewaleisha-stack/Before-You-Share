import { describe, expect, it } from 'vitest';
import { countByType, detect } from '../src/engine/resolve';
import { normalize, partialMask, redact } from '../src/engine/redact';
import { luhn, parseIPv6 } from '../src/engine/validate';
import { SAMPLE } from '../src/sample';
import { decodeUpload, outputName } from '../src/io/files';
import type { EntityType } from '../src/engine/types';

const typesOf = (t: string) => detect(t).matches.map((m) => m.type);
const only = (t: string, type: EntityType) => detect(t).matches.filter((m) => m.type === type).map((m) => m.raw);

describe('T2 sample', () => {
  it('finds exactly 14 matches with 1 Luhn rejection', () => {
    const d = detect(SAMPLE);
    expect(countByType(d.matches)).toEqual({ EMAIL: 4, PHONE: 2, IP: 4, PAN: 1, AADHAAR: 1, CARD: 2 });
    expect(d.matches.length).toBe(14);
    expect(d.rejected.length).toBe(1);
    expect(d.rejected[0].raw).toBe('4111 1111 1111 1112');
  });
  it('item 5 is the first card and item 1 is the From email', () => {
    const d = detect(SAMPLE);
    expect(d.matches[4].raw).toBe('4111 1111 1111 1111');
    expect(d.matches[0].raw).toBe('ananya.rao@example.com');
    expect(d.matches[13].type).toBe('IP');
  });
  it('does not flag 256.12.4.1 or 1234 5678 9012', () => {
    const raws = detect(SAMPLE).matches.map((m) => m.raw);
    expect(raws.some((r) => r.includes('256.12'))).toBe(false);
    expect(raws.includes('1234 5678 9012')).toBe(false);
  });
});

describe('T3 email', () => {
  it('matches addresses and skips retina asset names', () => {
    expect(only('mail ananya.rao@example.com now', 'EMAIL')).toEqual(['ananya.rao@example.com']);
    expect(only('icon@2x.png', 'EMAIL')).toEqual([]);
    expect(only('<a@x.com>', 'EMAIL')).toEqual(['a@x.com']);
    expect(only('write to a@x.com.', 'EMAIL')).toEqual(['a@x.com']);
    expect(only('git@github.com', 'EMAIL')).toEqual(['git@github.com']);
  });
});

describe('T4 phone', () => {
  it('matches Indian formats and shares one alias', () => {
    const t = '+91 98765 43210, 09876543210, 98765-43210, 1764220000';
    expect(only(t, 'PHONE')).toEqual(['+91 98765 43210', '09876543210', '98765-43210']);
    const d = detect(t);
    const out = redact(t, d.matches, 'pseudo').output;
    expect(out).toBe('PHONE_01, PHONE_01, PHONE_01, 1764220000');
  });
  it('matches +91- and 3-3-4, skips URL path IDs', () => {
    expect(only('+91-9876543210', 'PHONE')).toEqual(['+91-9876543210']);
    expect(only('987 654 3210', 'PHONE')).toEqual(['987 654 3210']);
    expect(only('/users/9876543210', 'PHONE')).toEqual([]);
  });
  it('matches international + numbers', () => {
    expect(only('call +44 20 7946 0958 today', 'PHONE')).toEqual(['+44 20 7946 0958']);
  });
});

describe('T5 IPv4 boundaries', () => {
  const cases: [string, string[]][] = [
    ['0.0.0.0', ['0.0.0.0']],
    ['255.255.255.255', ['255.255.255.255']],
    ['256.1.1.1', []],
    ['1.2.3.256', []],
    ['v1.2.3.4', []],
    ['1.3.6.1.4.1', []],
    ['10.0.0.1.', ['10.0.0.1']],
    ['10.0.0.5:8080', ['10.0.0.5']],
    ['01.2.3.4', []],
  ];
  for (const [input, expected] of cases) it(input, () => expect(only(input, 'IP')).toEqual(expected));
});

describe('IPv6', () => {
  it('matches compressed and full forms', () => {
    expect(only('::1', 'IP')).toEqual(['::1']);
    expect(only('host 2001:db8::1 up', 'IP')).toEqual(['2001:db8::1']);
    expect(only('[2001:db8::1]:443', 'IP')).toEqual(['2001:db8::1']);
    expect(only('::ffff:192.0.2.1', 'IP')).toEqual(['::ffff:192.0.2.1']);
  });
  it('rejects times and MAC addresses', () => {
    expect(only('at 10:45:12', 'IP')).toEqual([]);
    expect(only('mac 00:1A:2B:3C:4D:5E', 'IP')).toEqual([]);
  });
  it('normalizes to the same alias', () => {
    expect(parseIPv6('2001:DB8:0:0:0:0:0:1')).toEqual(parseIPv6('2001:db8::1'));
    const t = '2001:db8::1 and 2001:DB8:0:0:0:0:0:1';
    expect(redact(t, detect(t).matches, 'pseudo').output).toBe('IP_01 and IP_01');
  });
});

describe('T6 PAN', () => {
  it('format match with holder type', () => {
    expect(only('ABCPE1234F', 'PAN')).toEqual(['ABCPE1234F']);
    expect(only('ABCDE1234F', 'PAN')).toEqual([]);
    expect(only('XABCPE1234F', 'PAN')).toEqual([]);
    expect(only('ORDABCPE1234FX9', 'PAN')).toEqual([]);
    expect(only('abcpe1234f', 'PAN')).toEqual(['abcpe1234f']);
    expect(only('AbCPE1234F', 'PAN')).toEqual([]);
  });
});

describe('T7 Aadhaar', () => {
  it('format match', () => {
    expect(only('2345 6789 0123', 'AADHAAR')).toEqual(['2345 6789 0123']);
    expect(only('1234 5678 9012', 'AADHAAR')).toEqual([]);
    expect(only('0234 5678 9012', 'AADHAAR')).toEqual([]);
    expect(only('2345-6789-0123', 'AADHAAR')).toEqual(['2345-6789-0123']);
    expect(only('2345 6789-0123', 'AADHAAR')).toEqual([]);
  });
});

describe('T8 valid cards', () => {
  for (const c of ['4111 1111 1111 1111', '5555 5555 5555 4444', '3782 822463 10005', '6011 1111 1111 1117', '4242424242424242']) {
    it(c, () => {
      expect(luhn(c)).toBe(true);
      expect(typesOf(c)).toEqual(['CARD']);
      expect(redact(c, detect(c).matches, 'full').output).toBe('[REDACTED]');
    });
  }
});

describe('T9 invalid cards', () => {
  for (const c of ['4111 1111 1111 1112', '1234 5678 9012 3456', '0000 0000 0000 0000', '4242424242424241']) {
    it(c, () => {
      const d = detect(c);
      expect(d.matches.length).toBe(0); // no Card, no Aadhaar, no Phone inside
      expect(d.rejected.length).toBe(1);
      for (const mode of ['full', 'partial', 'pseudo'] as const) expect(redact(c, d.matches, mode, d.rejected).output).toBe(c);
    });
  }
});

describe('T10–T12 overlaps', () => {
  it('email beats phone in local part', () => expect(typesOf('ravi.9876543210@example.com')).toEqual(['EMAIL']));
  it('91[6-9] 12-digit value is a phone', () => expect(typesOf('919876543210')).toEqual(['PHONE']));
  it('card beats Aadhaar slice', () => expect(typesOf('4111 1111 1111 1111')).toEqual(['CARD']));
});

describe('T13 full mask', () => {
  it('replaces every match and keeps other text', () => {
    const d = detect(SAMPLE);
    const r = redact(SAMPLE, d.matches, 'full', d.rejected);
    expect(r.output.split('[REDACTED]').length - 1).toBe(14);
    const outside = SAMPLE.replace(/x/g, 'x');
    // rebuild the source from segments: text outside matches is identical
    let rebuilt = '';
    for (const s of r.segments) rebuilt += s.kind === 'match' ? SAMPLE.slice(s.src[0], s.src[1]) : outside.slice(s.src[0], s.src[1]);
    expect(rebuilt).toBe(SAMPLE);
    expect(r.output).toContain('4111 1111 1111 1112');
  });
});

describe('T14 partial mask matrix', () => {
  const rows: [EntityType, string, string][] = [
    ['EMAIL', 'ananya.rao@example.com', 'a***@example.com'],
    ['EMAIL', 'Ananya.Rao@example.com', 'A***@example.com'],
    ['EMAIL', 'jo@example.net', '***@example.net'],
    ['PHONE', '+91 98765 43210', '+91 XXXXX X3210'],
    ['PHONE', '09876543210', '0XXXXXX3210'],
    ['IP', '203.0.113.42', '203.0.x.x'],
    ['IP', '2001:db8::8a2e:370:7334', '2001:db8:x:x:x:x:x:x'],
    ['PAN', 'ABCPE1234F', 'XXXXXX234F'],
    ['AADHAAR', '2345 6789 0123', 'XXXX XXXX 0123'],
    ['CARD', '4111 1111 1111 1111', 'XXXX XXXX XXXX 1111'],
    ['CARD', '3782 822463 10005', 'XXXX XXXXXX X0005'],
  ];
  for (const [type, input, expected] of rows) {
    it(input, () => {
      const d = detect(input);
      expect(d.matches.map((m) => m.type)).toEqual([type]);
      expect(partialMask(type, input)).toBe(expected);
      expect(redact(input, d.matches, 'partial').output).toBe(expected);
    });
  }
});

describe('T15 repeated vs distinct', () => {
  it('same email in mixed case shares one alias', () => {
    const t = 'a.b@example.com A.B@example.com a.b@EXAMPLE.com other@example.org';
    const r = redact(t, detect(t).matches, 'pseudo');
    expect(r.output).toBe('EMAIL_01 EMAIL_01 EMAIL_01 EMAIL_02');
    expect(r.aliasCounts.get('EMAIL_01')).toBe(3);
  });
  it('does not merge plus-tags or dots', () => {
    expect(normalize('EMAIL', 'a+x@example.com')).not.toBe(normalize('EMAIL', 'a@example.com'));
  });
});

describe('T16 mode switching', () => {
  it('counts and aliases are stable', () => {
    const d = detect(SAMPLE);
    const a = redact(SAMPLE, d.matches, 'pseudo').output;
    redact(SAMPLE, d.matches, 'full');
    redact(SAMPLE, d.matches, 'partial');
    expect(redact(SAMPLE, d.matches, 'pseudo').output).toBe(a);
    expect(a).not.toContain('ananya');
    expect(a).not.toContain('98765');
  });
});

describe('Files', () => {
  const enc = (s: string) => new TextEncoder().encode(s);
  it('rejects wrong type, empty, oversize and non-UTF-8', () => {
    expect(decodeUpload('report.pdf', enc('x'))).toEqual({ ok: false, error: 'Error: Can\'t open "report.pdf". Only .txt and .csv files are supported.' });
    expect(decodeUpload('notes.txt', new Uint8Array())).toEqual({ ok: false, error: 'Error: "notes.txt" is empty.' });
    const big = decodeUpload('logs.txt', new Uint8Array(Math.round(3.2 * 1024 * 1024)));
    expect(big).toEqual({ ok: false, error: 'Error: "logs.txt" is 3.2 MB. The limit is 1 MB.' });
    const latin1 = decodeUpload('data.csv', new Uint8Array([0x63, 0x61, 0x66, 0xe9]));
    expect(latin1).toEqual({ ok: false, error: 'Error: "data.csv" isn\'t readable as UTF-8 text. Save it as UTF-8 and try again.' });
  });
  it('strips and remembers the BOM', () => {
    const r = decodeUpload('A.CSV', new Uint8Array([0xef, 0xbb, 0xbf, ...enc('a,b')]));
    expect(r.ok && r.file.hadBom && r.file.text === 'a,b' && r.file.ext === 'csv').toBe(true);
  });
  it('names outputs', () => {
    expect(outputName('ticket.txt')).toBe('ticket.sanitized.txt');
    expect(outputName('data.CSV')).toBe('data.sanitized.csv');
    expect(outputName(null, new Date(2026, 10, 27, 9, 5))).toBe('sanitized-20261127-0905.txt');
  });
});
