/** Luhn checksum over the digits of `value` (separators ignored). */
export function luhn(value: string): boolean {
  const digits = value.replace(/\D/g, '');
  if (digits.length === 0) return false;
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48;
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return sum % 10 === 0;
}

export function isAllZero(value: string): boolean {
  return /^0+$/.test(value.replace(/\D/g, ''));
}

/** True when every octet is 0–255 with no leading zeros. */
export function isValidIPv4(value: string): boolean {
  const parts = value.split('.');
  if (parts.length !== 4) return false;
  return parts.every((p) => /^(0|[1-9]\d{0,2})$/.test(p) && Number(p) <= 255);
}

/**
 * Parses an IPv6 address (full, `::`-compressed, or with an embedded IPv4 tail)
 * and returns its 8 groups as lowercase hex without leading zeros, or null.
 * Zone IDs (`%eth0`) are not supported.
 */
export function parseIPv6(value: string): string[] | null {
  if (!/[0-9a-fA-F]/.test(value)) return null;
  const doubles = value.split('::').length - 1;
  if (doubles > 1) return null;

  let text = value;
  let tail: string[] = [];
  const lastColon = text.lastIndexOf(':');
  const lastPart = text.slice(lastColon + 1);
  if (lastPart.includes('.')) {
    if (!isValidIPv4(lastPart)) return null;
    const o = lastPart.split('.').map(Number);
    tail = [((o[0] << 8) | o[1]).toString(16), ((o[2] << 8) | o[3]).toString(16)];
    text = text.slice(0, lastColon + 1);
    // "::ffff:" → keep the trailing "::" intact, drop a single trailing ":"
    if (text.endsWith(':') && !text.endsWith('::')) text = text.slice(0, -1);
  }

  const hexGroup = /^[0-9a-fA-F]{1,4}$/;
  const splitGroups = (s: string): string[] | null => {
    if (s === '') return [];
    const g = s.split(':');
    return g.every((x) => hexGroup.test(x)) ? g : null;
  };

  let groups: string[];
  if (doubles === 1) {
    const [left, right] = text.split('::');
    const l = splitGroups(left);
    const r = splitGroups(right);
    if (!l || !r) return null;
    const present = l.length + r.length + tail.length;
    if (present > 7) return null;
    groups = [...l, ...Array(8 - present).fill('0'), ...r, ...tail];
  } else {
    const g = splitGroups(text);
    if (!g) return null;
    groups = [...g, ...tail];
    if (groups.length !== 8) return null;
  }
  return groups.map((g) => parseInt(g, 16).toString(16));
}
