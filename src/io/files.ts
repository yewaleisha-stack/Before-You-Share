export const MAX_BYTES = 1024 * 1024; // 1 MB

export interface LoadedFile {
  name: string;
  text: string;
  hadBom: boolean;
  ext: 'txt' | 'csv';
}

export type LoadResult = { ok: true; file: LoadedFile } | { ok: false; error: string };

const fmtMB = (bytes: number) => `${(bytes / MAX_BYTES).toFixed(1)} MB`;

/** Checks name and size before reading, so oversized files are never loaded. */
export function precheckUpload(name: string, size: number): string | null {
  if (!/\.(txt|csv)$/i.test(name)) return `Error: Can't open "${name}". Only .txt and .csv files are supported.`;
  if (size > MAX_BYTES) return `Error: "${name}" is ${fmtMB(size)}. The limit is 1 MB.`;
  if (size === 0) return `Error: "${name}" is empty.`;
  return null;
}

/** Validates and decodes uploaded bytes as strict UTF-8. Pure, so it is unit-testable. */
export function decodeUpload(name: string, bytes: Uint8Array): LoadResult {
  const pre = precheckUpload(name, bytes.length);
  if (pre) return { ok: false, error: pre };
  const m = /\.(txt|csv)$/i.exec(name)!;
  if (bytes.includes(0)) return { ok: false, error: `Error: "${name}" isn't readable as UTF-8 text. Save it as UTF-8 and try again.` };
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    return { ok: false, error: `Error: "${name}" isn't readable as UTF-8 text. Save it as UTF-8 and try again.` };
  }
  const hadBom = text.charCodeAt(0) === 0xfeff;
  if (hadBom) text = text.slice(1);
  if (text.length === 0) return { ok: false, error: `Error: "${name}" is empty.` };
  return { ok: true, file: { name, text, hadBom, ext: m[1].toLowerCase() as 'txt' | 'csv' } };
}

export function outputName(sourceName: string | null, now = new Date()): string {
  if (!sourceName) {
    const p = (n: number) => String(n).padStart(2, '0');
    return `sanitized-${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}-${p(now.getHours())}${p(now.getMinutes())}.txt`;
  }
  const m = /^(.*)\.(txt|csv)$/i.exec(sourceName);
  const base = m ? m[1] : sourceName;
  const ext = m ? m[2].toLowerCase() : 'txt';
  return `${base}.sanitized.${ext}`;
}

type HostDownloads = { save(req: { filename: string; data: Blob }): Promise<unknown> };
type HostClaude = { use(name: string): Promise<unknown> };

/**
 * Saves the file. When the page runs inside a host frame that blocks normal
 * downloads (e.g. a hosted claude.ai page), the host's downloads capability is
 * used instead. Resolves true when the file was handed to the browser.
 */
export async function download(name: string, text: string, hadBom: boolean): Promise<boolean> {
  const type = name.endsWith('.csv') ? 'text/csv;charset=utf-8' : 'text/plain;charset=utf-8';
  const blob = new Blob([hadBom ? '﻿' + text : text], { type });
  const host = (globalThis as unknown as { claude?: HostClaude }).claude;
  if (host && typeof host.use === 'function') {
    const dl = (await host.use('downloads').catch(() => null)) as HostDownloads | null;
    if (dl) {
      try {
        await dl.save({ filename: name, data: blob });
        return true;
      } catch {
        return false;
      }
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
}
