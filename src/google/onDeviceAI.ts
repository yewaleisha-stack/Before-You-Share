/**
 * Optional: Chrome's built-in AI Summarizer API (Gemini Nano), which runs
 * on-device. It only ever receives the *sanitized* result, never the source,
 * and makes no network request with document content. Hidden entirely when
 * the browser doesn't support it, so the core app is unaffected.
 * https://developer.chrome.com/docs/ai/summarizer-api
 */
interface SummarizerLike {
  summarize(text: string): Promise<string>;
  destroy?: () => void;
}
interface SummarizerStatic {
  availability(): Promise<'unavailable' | 'downloadable' | 'downloading' | 'available'>;
  create(opts: Record<string, unknown>): Promise<SummarizerLike>;
}

export async function initOnDeviceSummary(getSanitized: () => string): Promise<void> {
  const box = document.getElementById('ai-box');
  const btn = document.getElementById('btn-ai') as HTMLButtonElement | null;
  const out = document.getElementById('ai-out');
  if (!box || !btn || !out) return;

  const api = (globalThis as unknown as { Summarizer?: SummarizerStatic }).Summarizer;
  if (!api) return;
  let status: string;
  try {
    status = await api.availability();
  } catch {
    return;
  }
  if (status === 'unavailable') return;
  box.hidden = false;

  btn.addEventListener('click', async () => {
    const text = getSanitized();
    if (!text) {
      out.textContent = 'Add text first.';
      return;
    }
    btn.disabled = true;
    out.textContent = 'Summarizing on this device…';
    try {
      const s = await api.create({ type: 'key-points', format: 'plain-text', length: 'short' });
      out.textContent = await s.summarize(text.slice(0, 20_000));
      s.destroy?.();
    } catch (e) {
      out.textContent = `Error: On-device summary failed (${(e as Error).message}).`;
    } finally {
      btn.disabled = false;
    }
  });
}
