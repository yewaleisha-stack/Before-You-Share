import type { Candidate, EntityType } from './types';
import { isValidIPv4, parseIPv6 } from './validate';

/*
 * Every detector uses the same boundary: a candidate may not be preceded or
 * followed by a letter or digit. Regexes avoid nested unbounded quantifiers.
 */

const FILE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'css', 'js']);

function collect(text: string, re: RegExp, type: EntityType, accept?: (raw: string) => string | null): Candidate[] {
  const out: Candidate[] = [];
  re.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const raw0 = m[0];
    const raw = accept ? accept(raw0) : raw0;
    if (raw) out.push({ type, start: m.index, end: m.index + raw.length, raw });
    if (m[0].length === 0) re.lastIndex++;
  }
  return out;
}

// ---------- Email ----------
const EMAIL_RE = /(?<![A-Za-z0-9._%+-])[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/g;

/** Trims invalid trailing labels; returns the accepted email text or null. */
export function acceptEmail(raw: string): string | null {
  const at = raw.indexOf('@');
  const local = raw.slice(0, at);
  if (!/[A-Za-z0-9]/.test(local)) return null;
  const labels = raw.slice(at + 1).split('.');
  const okLabel = (l: string) => /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/.test(l);
  while (labels.length >= 2) {
    const tld = labels[labels.length - 1];
    if (labels.every(okLabel) && /^[A-Za-z]{2,}$/.test(tld)) {
      if (FILE_EXTENSIONS.has(tld.toLowerCase())) return null;
      const candidate = `${local}@${labels.join('.')}`;
      return candidate;
    }
    labels.pop();
  }
  return null;
}

export function detectEmails(text: string): Candidate[] {
  return collect(text, EMAIL_RE, 'EMAIL', (raw) => {
    const accepted = acceptEmail(raw);
    if (!accepted) return null;
    return accepted;
  }).filter((c) => !/[A-Za-z0-9]/.test(text[c.end] ?? ''));
}

// ---------- Phone ----------
// India mobile: optional +91 / 91 / 0 prefix, 10 digits starting 6–9,
// contiguous, 5-5, or 3-3-4 with a space or hyphen. Not preceded by "/".
const INDIA_PHONE_RE =
  /(?<![A-Za-z0-9/+])(?:\+91[ -]?|91|0)?[6-9](?:\d{9}|\d{4}[ -]\d{5}|\d{2}[ -]\d{3}[ -]\d{4})(?![A-Za-z0-9])/g;
// International: leading "+" (not +91), 8–15 digits total.
const INTL_PHONE_RE = /(?<![A-Za-z0-9/+])\+(?!91)[1-9]\d{0,3}(?:[ -]?\d{2,5}){1,5}(?![A-Za-z0-9])/g;

export function detectPhones(text: string): Candidate[] {
  const india = collect(text, INDIA_PHONE_RE, 'PHONE');
  const intl = collect(text, INTL_PHONE_RE, 'PHONE', (raw) => {
    const n = raw.replace(/\D/g, '').length;
    return n >= 8 && n <= 15 ? raw : null;
  });
  return [...india, ...intl];
}

// ---------- IP ----------
const OCTET = '(?:25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)';
const IPV4_RE = new RegExp(`(?<![A-Za-z0-9.])(?:${OCTET}\\.){3}${OCTET}(?![A-Za-z0-9]|\\.\\d)`, 'g');
const IPV6_RE =
  /(?<![A-Za-z0-9:.])(?:[0-9A-Fa-f]{0,4}:){2,7}(?:\d{1,3}(?:\.\d{1,3}){3}|[0-9A-Fa-f]{0,4})(?![A-Za-z0-9:])/g;

export function detectIPs(text: string): Candidate[] {
  const v4 = collect(text, IPV4_RE, 'IP', (raw) => (isValidIPv4(raw) ? raw : null));
  const v6 = collect(text, IPV6_RE, 'IP', (raw) => (parseIPv6(raw) ? raw : null));
  return [...v4, ...v6];
}

// ---------- PAN ----------
// Format match only: 4th character is a holder type. Upper or all-lowercase.
const PAN_RE =
  /(?<![A-Za-z0-9])(?:[A-Z]{3}[ABCFGHJLPT][A-Z]\d{4}[A-Z]|[a-z]{3}[abcfghjlpt][a-z]\d{4}[a-z])(?![A-Za-z0-9])/g;

export function detectPANs(text: string): Candidate[] {
  return collect(text, PAN_RE, 'PAN');
}

// ---------- Aadhaar ----------
// Format match only: 12 digits, first 2–9, contiguous or 4-4-4 with one
// consistent separator. A contiguous 91[6-9]… value is a phone, not Aadhaar.
const AADHAAR_RE = /(?<![A-Za-z0-9])[2-9]\d{3}(?:([ -])\d{4}\1\d{4}|\d{8})(?![A-Za-z0-9])/g;

export function detectAadhaar(text: string): Candidate[] {
  return collect(text, AADHAAR_RE, 'AADHAAR', (raw) => (/^91[6-9]\d{9}$/.test(raw) ? null : raw));
}

// ---------- Card-shaped runs ----------
// 13–19 contiguous digits, or 4-4-4-4, 4-4-4-4-3, 4-6-5 (Amex), 4-6-4 (Diners)
// with one consistent separator. Luhn is applied in resolve().
const CARD_RE =
  /(?<![A-Za-z0-9])(?:\d{13,19}|\d{4}([ -])\d{4}\1\d{4}\1\d{4}(?:\1\d{3})?|\d{4}([ -])\d{6}\2\d{5}|\d{4}([ -])\d{6}\3\d{4})(?![A-Za-z0-9])/g;

export function detectCardShaped(text: string): Candidate[] {
  return collect(text, CARD_RE, 'CARD');
}

export function detectAll(text: string): Candidate[] {
  return [
    ...detectEmails(text),
    ...detectPhones(text),
    ...detectIPs(text),
    ...detectPANs(text),
    ...detectAadhaar(text),
    ...detectCardShaped(text),
  ];
}
