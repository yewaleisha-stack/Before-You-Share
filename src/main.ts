import './styles.css';
import { countByType, detect } from './engine/resolve';
import { redact } from './engine/redact';
import { ENTITY_TYPES, TYPE_NAMES, type Detection, type Mode, type RedactionResult } from './engine/types';
import { decodeUpload, download, MAX_BYTES, outputName, precheckUpload } from './io/files';
import { renderPane } from './ui/render';
import { SAMPLE, SAMPLE_NAME } from './sample';
import { initOnDeviceSummary } from './google/onDeviceAI';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const els = {
  total: $('total'),
  chips: $('chips'),
  status: $('status'),
  srcTitle: $('src-title'),
  editor: $<HTMLTextAreaElement>('editor'),
  srcView: $('src-view'),
  outView: $('out-view'),
  sample: $<HTMLButtonElement>('btn-sample'),
  upload: $<HTMLInputElement>('file'),
  uploadBtn: $<HTMLButtonElement>('btn-upload'),
  edit: $<HTMLButtonElement>('btn-edit'),
  clear: $<HTMLButtonElement>('btn-clear'),
  dl: $<HTMLButtonElement>('btn-download'),
  dlHint: $('dl-hint'),
  modeHelp: $('mode-help'),
  prev: $<HTMLButtonElement>('btn-prev'),
  next: $<HTMLButtonElement>('btn-next'),
  readout: $('readout'),
  live: $('live'),
};

const resultSheet = document.querySelector('.sheet-result') as HTMLElement;
const editLabel = els.edit.querySelector('.lbl') as HTMLElement;
const dlLabel = els.dl.querySelector('.lbl') as HTMLElement;

const MODE_HELP: Record<Mode, string> = {
  full: 'Every match becomes [REDACTED].',
  partial: 'Keeps the last 4 digits, first IP octets, or the email domain.',
  pseudo: 'Repeated values share one alias, e.g. EMAIL_01.',
};

interface State {
  text: string;
  name: string | null;
  ext: 'txt' | 'csv';
  hadBom: boolean;
  hadCrlf: boolean;
  edited: boolean;
  mode: Mode;
  editing: boolean;
  detection: Detection;
  result: RedactionResult;
  selected: number | null;
  lastDownload: { mode: Mode; name: string } | null;
  error: string | null;
}

const empty: Detection = { matches: [], rejected: [] };
const state: State = {
  text: '',
  name: null,
  ext: 'txt',
  hadBom: false,
  hadCrlf: false,
  edited: false,
  mode: 'full',
  editing: true,
  detection: empty,
  result: redact('', [], 'full'),
  selected: null,
  lastDownload: null,
  error: null,
};

// ---------- pipeline ----------
function runDetection() {
  state.detection = state.text ? detect(state.text) : empty;
  rebuild();
}

function rebuild() {
  state.result = redact(state.text, state.detection.matches, state.mode, state.detection.rejected);
  render();
}

// ---------- rendering ----------
function render() {
  const { matches, rejected } = state.detection;
  const counts = countByType(matches);
  const hasText = state.text.length > 0;

  els.total.textContent = hasText ? `${matches.length} to replace` : 'No text yet.';
  els.chips.replaceChildren(
    ...ENTITY_TYPES.map((t) => {
      const li = document.createElement('li');
      li.className = `chip t-${t.toLowerCase()}`;
      li.textContent = `${TYPE_NAMES[t]} ${counts[t]}`;
      return li;
    }),
  );

  // Status line: error > zero matches > rejected notice > download info
  const lines: string[] = [];
  if (state.error) lines.push(state.error);
  if (hasText && matches.length === 0)
    lines.push('No supported identifiers found. Checked for email, phone, IP, PAN, Aadhaar and card numbers. The result is identical to the source.');
  if (rejected.length)
    lines.push(
      `${rejected.length} card-like number${rejected.length > 1 ? 's' : ''} failed the Luhn check and ${rejected.length > 1 ? 'were' : 'was'} left unchanged.`,
    );
  if (state.edited && state.hadCrlf) lines.push('Line endings were changed to LF when you edited.');
  if (state.lastDownload) {
    lines.push(
      state.lastDownload.mode === state.mode
        ? `Saved ${state.lastDownload.name} · ${modeLabel(state.mode)} · ${matches.length} replacements`
        : 'Mode changed since your last download.',
    );
  }
  els.status.replaceChildren(
    ...lines.map((l) => {
      const p = document.createElement('p');
      p.textContent = l;
      if (l.startsWith('Error:')) p.className = 'error';
      return p;
    }),
  );

  // Source pane
  els.srcTitle.textContent = `${state.name ?? (hasText ? 'Pasted text' : 'No file')} · ${state.editing ? 'Editing' : 'Review'}`;
  els.editor.hidden = !state.editing;
  els.srcView.hidden = state.editing;
  editLabel.textContent = state.editing ? 'Done editing' : 'Edit text';
  els.edit.disabled = state.editing && !hasText;
  if (!state.editing) els.srcView.replaceChildren(renderPane(state.text, state.result.segments, 'source'));

  // Result pane
  resultSheet.dataset.mode = state.mode;
  if (hasText) els.outView.replaceChildren(renderPane(state.text, state.result.segments, 'result'));
  else {
    const p = document.createElement('p');
    p.className = 'placeholder';
    p.textContent = 'The shareable version appears here, e.g. ananya@example.com → EMAIL_01.';
    els.outView.replaceChildren(p);
  }

  // Download
  els.dl.disabled = !hasText;
  dlLabel.textContent = !hasText
    ? `Download sanitized .${state.ext}`
    : matches.length === 0
      ? 'Download copy (no changes)'
      : `Download sanitized .${state.ext}`;
  els.dlHint.hidden = hasText;

  els.prev.disabled = els.next.disabled = matches.length === 0 || state.editing;
  els.modeHelp.textContent = MODE_HELP[state.mode];
  applySelection(false);
}

const modeLabel = (m: Mode) => ({ full: 'Full mask', partial: 'Partial mask', pseudo: 'Pseudonymize' })[m];

// ---------- linked review ----------
function centerIn(container: HTMLElement, el: HTMLElement) {
  const c = container.getBoundingClientRect();
  const r = el.getBoundingClientRect();
  const rel = r.top - c.top + container.scrollTop;
  container.scrollTop = Math.max(0, rel - container.clientHeight / 2 + r.height / 2);
}

function applySelection(scroll: boolean) {
  for (const el of document.querySelectorAll('mark.active, mark.same')) el.classList.remove('active', 'same');
  const id = state.selected;
  const matches = state.detection.matches;
  if (id === null || !matches[id]) {
    els.readout.textContent = matches.length ? 'Select a highlighted item, or focus a pane and press ↓.' : '';
    delete els.readout.dataset.type;
    return;
  }
  const m = matches[id];
  const seg = state.result.segments.find((s) => s.kind === 'match' && s.id === id);
  if (!seg || seg.kind !== 'match') return;
  const marks = document.querySelectorAll<HTMLElement>(`mark[data-id="${id}"]`);
  marks.forEach((el) => el.classList.add('active'));
  if (seg.alias) {
    document.querySelectorAll<HTMLElement>(`mark[data-alias="${seg.alias}"]`).forEach((el) => {
      if (el.dataset.id !== String(id)) el.classList.add('same');
    });
  }
  const sameType = matches.filter((x) => x.type === m.type);
  const n = sameType.indexOf(m) + 1;
  const typeName = m.type === 'AADHAAR' ? 'Aadhaar (format match)' : TYPE_NAMES[m.type];
  let text = `${typeName} ${n} of ${sameType.length} · item ${id + 1} of ${matches.length} → ${seg.out}`;
  if (seg.alias) {
    const k = state.result.aliasCounts.get(seg.alias) ?? 1;
    text += `, used ${k} time${k === 1 ? '' : 's'}`;
  }
  els.readout.textContent = text;
  els.readout.dataset.type = m.type.toLowerCase();
  if (scroll) {
    els.live.textContent = text;
    const s = els.srcView.querySelector<HTMLElement>(`mark[data-id="${id}"]`);
    const o = els.outView.querySelector<HTMLElement>(`mark[data-id="${id}"]`);
    if (s && !els.srcView.hidden) centerIn(els.srcView, s);
    if (o) centerIn(els.outView, o);
  }
}

function select(id: number | null) {
  state.selected = id;
  applySelection(true);
}

function step(delta: number) {
  const n = state.detection.matches.length;
  if (!n) return;
  const cur = state.selected;
  select(cur === null ? (delta > 0 ? 0 : n - 1) : Math.min(n - 1, Math.max(0, cur + delta)));
}

function onPaneClick(e: MouseEvent) {
  const mark = (e.target as HTMLElement).closest<HTMLElement>('mark[data-id]');
  if (mark) select(Number(mark.dataset.id));
}

function onPaneKey(e: KeyboardEvent) {
  const n = state.detection.matches.length;
  if (!n) return;
  const k = e.key;
  if (k === 'ArrowDown' || k === 'ArrowRight' || k === 'j' || k === 'J') step(1);
  else if (k === 'ArrowUp' || k === 'ArrowLeft' || k === 'k' || k === 'K') step(-1);
  else if (k === 'Home') select(0);
  else if (k === 'End') select(n - 1);
  else if (k === 'Escape') select(null);
  else return;
  e.preventDefault();
}

for (const pane of [els.srcView, els.outView]) {
  pane.addEventListener('click', onPaneClick);
  pane.addEventListener('keydown', onPaneKey);
}
els.prev.addEventListener('click', () => step(-1));
els.next.addEventListener('click', () => step(1));

// ---------- document lifecycle ----------
function loadDocument(text: string, name: string | null, opts: { ext?: 'txt' | 'csv'; hadBom?: boolean } = {}) {
  state.text = text;
  state.name = name;
  state.ext = opts.ext ?? 'txt';
  state.hadBom = opts.hadBom ?? false;
  state.hadCrlf = text.includes('\r\n');
  state.edited = false;
  state.selected = null;
  state.lastDownload = null;
  state.error = null;
  state.editing = text.length === 0;
  runDetection();
  if (state.editing) els.editor.focus({ preventScroll: true });
  else els.srcView.focus({ preventScroll: true });
}

els.sample.addEventListener('click', () => loadDocument(SAMPLE, SAMPLE_NAME));

els.uploadBtn.addEventListener('click', () => els.upload.click());
els.upload.addEventListener('change', async () => {
  const f = els.upload.files?.[0];
  els.upload.value = '';
  if (!f) return;
  const pre = precheckUpload(f.name, f.size);
  const res = pre ? ({ ok: false, error: pre } as const) : decodeUpload(f.name, new Uint8Array(await f.arrayBuffer()));
  if (!res.ok) {
    state.error = res.error; // previous content stays unchanged
    render();
    els.uploadBtn.focus();
    return;
  }
  loadDocument(res.file.text, res.file.name, { ext: res.file.ext, hadBom: res.file.hadBom });
});

els.clear.addEventListener('click', () => {
  els.editor.value = '';
  loadDocument('', null);
});

function setEditing(on: boolean) {
  if (on) {
    els.editor.value = state.text;
    state.editing = true;
    state.selected = null;
    render();
    els.editor.focus();
  } else {
    flushEdit();
    if (!state.text) return;
    state.editing = false;
    render();
    els.srcView.focus();
  }
}
els.edit.addEventListener('click', () => setEditing(!state.editing));

let timer: number | undefined;
function flushEdit() {
  window.clearTimeout(timer);
  const value = els.editor.value;
  if (new TextEncoder().encode(value).length > MAX_BYTES) {
    state.error = "Error: Text over 1 MB isn't supported. Split it into smaller parts.";
    render();
    return;
  }
  if (value === state.text) return;
  state.error = null;
  if (state.text) state.edited = true;
  state.text = value;
  state.selected = null;
  state.lastDownload = null;
  runDetection();
}
els.editor.addEventListener('input', () => {
  els.edit.disabled = els.editor.value.length === 0;
  window.clearTimeout(timer);
  timer = window.setTimeout(flushEdit, els.editor.value.length > 100_000 ? 300 : 150);
});
els.editor.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    setEditing(false);
  }
});

for (const radio of document.querySelectorAll<HTMLInputElement>('input[name="mode"]')) {
  radio.addEventListener('change', () => {
    state.mode = radio.value as Mode;
    rebuild(); // cached matches: counts, IDs and selection are unchanged
  });
}

els.dl.addEventListener('click', async () => {
  if (state.editing) flushEdit();
  if (!state.text) return;
  const name = outputName(state.name);
  const saved = await download(name, state.result.output, state.hadBom);
  if (!saved) return;
  state.lastDownload = { mode: state.mode, name };
  render();
});

// Live privacy proof: count network requests made after the page finished loading.
function watchNetwork() {
  const out = document.getElementById('net-count');
  const seal = document.getElementById('seal');
  if (!out || !seal || typeof PerformanceObserver === 'undefined') return;
  const since = performance.now();
  let n = 0;
  const mirrors = document.querySelectorAll<HTMLElement>('[data-net-mirror]');
  const show = () => {
    out.textContent = `${n} request${n === 1 ? '' : 's'} since load`;
    mirrors.forEach((m) => (m.textContent = String(n)));
    seal.classList.toggle('seal-warn', n > 0);
  };
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        // Web-font files can load lazily the first time a weight is drawn; they carry no document data.
        const isFont = e.name.startsWith('https://fonts.gstatic.com/');
        if (e.startTime >= since && !isFont && !e.name.startsWith('blob:') && !e.name.startsWith('data:')) n++;
      }
      show();
    }).observe({ type: 'resource', buffered: false });
  } catch {
    return;
  }
  show();
}
if (document.readyState === 'complete') watchNetwork();
else window.addEventListener('load', watchNetwork, { once: true });

initOnDeviceSummary(() => (state.text ? state.result.output : ''));
// Landing-page calls to action: load the sample, then let the anchor scroll to the tool.
for (const a of document.querySelectorAll<HTMLElement>('[data-action="sample"]')) {
  a.addEventListener('click', () => {
    loadDocument(SAMPLE, SAMPLE_NAME);
  });
}

render();
els.editor.focus({ preventScroll: true });
