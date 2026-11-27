import type { EntityType, Segment } from '../engine/types';

export const LABELS: Record<EntityType, string> = {
  EMAIL: 'EML',
  PHONE: 'PHN',
  IP: 'IP',
  PAN: 'PAN',
  AADHAAR: 'AAD',
  CARD: 'CARD',
};

/**
 * Builds one pane from the shared segment list. Everything is set with
 * textContent — never innerHTML — so HTML-like input stays literal text.
 */
export function renderPane(text: string, segments: Segment[], side: 'source' | 'result'): DocumentFragment {
  const frag = document.createDocumentFragment();
  for (const s of segments) {
    const srcText = text.slice(s.src[0], s.src[1]);
    if (s.kind === 'text') {
      frag.appendChild(document.createTextNode(srcText));
    } else if (s.kind === 'rejected') {
      const span = document.createElement('span');
      span.className = 'rej';
      span.title = s.reason === 'luhn' ? 'Failed Luhn check — not treated as a card.' : 'All zeros — not treated as a card.';
      if (side === 'source') span.dataset.label = 'NOT CARD';
      span.textContent = srcText;
      frag.appendChild(span);
    } else {
      const mark = document.createElement('mark');
      mark.className = `m t-${s.type.toLowerCase()}`;
      mark.dataset.id = String(s.id);
      if (s.alias) mark.dataset.alias = s.alias;
      if (side === 'source') mark.dataset.label = LABELS[s.type];
      mark.textContent = side === 'source' ? srcText : s.out;
      frag.appendChild(mark);
    }
  }
  return frag;
}
