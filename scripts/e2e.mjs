// Browser checks for the "manual" rows of the acceptance matrix (T1, T2, T16–T19, T21–T26).
// Usage: node scripts/e2e.mjs [dir]   (default: dist). Requires playwright.
import { chromium } from 'playwright';
import http from 'node:http';
import { readFileSync, existsSync, writeFileSync, mkdtempSync } from 'node:fs';
import { join, extname } from 'node:path';
import { tmpdir } from 'node:os';

const dir = process.argv[2] ?? 'dist';
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const server = http.createServer((req, res) => {
  const p = join(dir, req.url === '/' ? 'index.html' : req.url.split('?')[0]);
  if (!existsSync(p)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': types[extname(p)] ?? 'application/octet-stream' });
  res.end(readFileSync(p));
}).listen(0);
const url = `http://127.0.0.1:${server.address().port}/`;

let pass = 0, fail = 0;
const check = (name, ok, detail = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : ' — ' + detail}`); };

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
const page = await ctx.newPage();
await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort()); // no internet here
const dialogs = []; page.on('dialog', (d) => { dialogs.push(d.message()); d.dismiss(); });
const cspErrors = []; page.on('console', (m) => { if (/Content.Security.Policy|Refused/i.test(m.text())) cspErrors.push(m.text()); });
await page.goto(url);
const requests = []; page.on('request', (r) => requests.push(r.url()));

const text = (sel) => page.locator(sel).innerText();
const tmp = mkdtempSync(join(tmpdir(), 'bys-'));

// T22 empty
check('T22 empty state', (await text('#total')) === 'No text yet.' && (await page.locator('#btn-download').isDisabled()) && (await page.locator('#dl-hint').isVisible()));
check('Empty: focus in textarea', await page.evaluate(() => document.activeElement?.id === 'editor'));

// T1 paste
await page.locator('#btn-sample').click();
const sampleText = await page.locator('#src-view').evaluate((el) => el.textContent);
await page.locator('#btn-clear').click();
const t0 = Date.now();
await page.locator('#editor').fill('mail ananya.rao@example.com and 4111 1111 1111 1111');
await page.waitForFunction(() => document.getElementById('total').textContent === '2 to replace', null, { timeout: 2000 });
check('T1 paste updates live', Date.now() - t0 < 1000, `${Date.now() - t0}ms`);

// T2 sample
await page.locator('#btn-sample').click();
check('T2 total 14', (await text('#total')) === '14 to replace', await text('#total'));
check('T2 chips', (await text('#chips')).replace(/\s+/g, ' ').includes('Email 4 Phone 2 IP 4 PAN 1 Aadhaar 1 Card 2'), await text('#chips'));
check('T2 Luhn notice', (await text('#status')).includes('1 card-like number failed the Luhn check and was left unchanged.'));
check('Review: focus in source region', await page.evaluate(() => document.activeElement?.id === 'src-view'));

// T17 linking after length change (Full mode)
await page.locator('#src-view mark[data-id="4"]').click();
check('T17 result outlined', await page.locator('#out-view mark[data-id="4"].active').count() === 1);
check('T17 readout', (await text('#readout')) === 'Card 1 of 2 · item 5 of 14 → [REDACTED]', await text('#readout'));
await page.locator('#src-view mark[data-id="13"]').click();
check('T17 last item (IPv6) outlined', await page.locator('#out-view mark[data-id="13"].active').count() === 1);
// reverse linking
await page.locator('#out-view mark[data-id="2"]').click();
check('Reverse link from result', await page.locator('#src-view mark[data-id="2"].active').count() === 1);

// T16 selection persists across modes
await page.locator('#src-view mark[data-id="4"]').click();
for (const m of ['partial', 'pseudo', 'full', 'pseudo']) await page.locator(`input[value="${m}"]`).check();
check('T16 counts stable', (await text('#total')) === '14 to replace');
check('T16 selection kept', await page.locator('#out-view mark[data-id="4"].active').count() === 1);
await page.locator('input[value="partial"]').check();
check('Partial card text', (await page.locator('#out-view mark[data-id="4"]').innerText()) === 'XXXX XXXX XXXX 1111');

// Pseudonymize readout + same-alias dashes
await page.locator('input[value="pseudo"]').check();
await page.locator('#src-view mark[data-id="0"]').click();
check('Pseudo readout', (await text('#readout')) === 'Email 1 of 4 · item 1 of 14 → EMAIL_01, used 3 times', await text('#readout'));
check('Same alias dashed (2 others × 2 panes)', await page.locator('mark.same').count() === 4, String(await page.locator('mark.same').count()));
await page.keyboard.press('ArrowDown');
check('↓ moves to phone', (await text('#readout')).startsWith('Phone 1 of 2 · item 2 of 14 → PHONE_01, used 2 times'), await text('#readout'));

// T18 keyboard
await page.locator('#src-view').focus();
await page.keyboard.press('Escape');
for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowDown');
check('T18 ↓×3 → item 3', (await text('#readout')).includes('item 3 of 14'));
await page.keyboard.press('End');
check('T18 End → item 14', (await text('#readout')).includes('item 14 of 14'));
const scrolled = await page.locator('#out-view').evaluate((el) => {
  const m = el.querySelector('mark.active'); const c = el.getBoundingClientRect(); const r = m.getBoundingClientRect();
  return r.top >= c.top && r.bottom <= c.bottom;
});
check('T18 result follows', scrolled);
check('T18 announced', (await text('#live')).includes('item 14 of 14'));
await page.keyboard.press('Escape');
check('T18 Esc clears', await page.locator('mark.active').count() === 0);

// T24 download in pseudo
const [dl] = await Promise.all([page.waitForEvent('download'), page.locator('#btn-download').click()]);
const dlPath = join(tmp, dl.suggestedFilename()); await dl.saveAs(dlPath);
const file = readFileSync(dlPath, 'utf8');
const pane = await page.locator('#out-view').evaluate((el) => el.textContent);
check('T24 filename', dl.suggestedFilename() === 'sample-ticket.sanitized.txt', dl.suggestedFilename());
check('T24 file equals result pane', file === pane);
check('T24 no raw values (case-sensitive, per plan)', !/ananya|4111 1111 1111 1111|98765/.test(file));
check('Export status', (await text('#status')).includes('Saved sample-ticket.sanitized.txt · Pseudonymize · 14 replacements'));
await page.locator('input[value="full"]').check();
check('Stale download notice', (await text('#status')).includes('Mode changed since your last download.'));

// T25 safe rendering
check('T25 literal HTML text', sampleText.includes('<img src=x onerror=alert(1)>') && (await page.locator('#src-view img, #out-view img').count()) === 0 && dialogs.length === 0);

// T19 / T21 uploads
const up = async (name, buf) => { const p = join(tmp, name); writeFileSync(p, buf); await page.locator('#file').setInputFiles(p); await page.waitForTimeout(100); };
await up('ticket.txt', 'Contact ravi@example.com');
check('T19 upload opens in Review', (await page.locator('#src-title').textContent()) === 'ticket.txt · Review' && (await text('#total')) === '1 to replace', (await text('#src-title')) + ' / ' + (await text('#total')));
const [dl2] = await Promise.all([page.waitForEvent('download'), page.locator('#btn-download').click()]);
check('T19 download name', dl2.suggestedFilename() === 'ticket.sanitized.txt');
const before = await page.locator('#src-view').innerText();
await up('report.pdf', 'x');
check('T21 pdf error', (await text('#status')).includes('Error: Can\'t open "report.pdf". Only .txt and .csv files are supported.'));
await up('big.txt', Buffer.alloc(2 * 1024 * 1024, 97));
check('T21 size error', (await text('#status')).includes('Error: "big.txt" is 2.0 MB. The limit is 1 MB.'));
await up('latin.csv', Buffer.from([0x63, 0x61, 0x66, 0xe9]));
check('T21 utf8 error', (await text('#status')).includes('Error: "latin.csv" isn\'t readable as UTF-8 text.'));
await up('notes.txt', Buffer.alloc(0));
check('T21 empty error', (await text('#status')).includes('Error: "notes.txt" is empty.'));
check('T21 content unchanged', (await page.locator('#src-view').innerText()) === before);

// CSV upload keeps BOM + CRLF
await up('data.csv', Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('a,email\r\n1,x@example.com\r\n')]));
const [dl3] = await Promise.all([page.waitForEvent('download'), page.locator('#btn-download').click()]);
const p3 = join(tmp, 'o.csv'); await dl3.saveAs(p3); const b3 = readFileSync(p3);
check('CSV: BOM + CRLF kept', b3[0] === 0xef && b3.toString('utf8').endsWith('1,[REDACTED]\r\n') && dl3.suggestedFilename() === 'data.sanitized.csv', b3.toString());

// T23 zero matches
await page.locator('#btn-clear').click();
await page.locator('#editor').fill('Meeting moved to Thursday.');
await page.locator('#editor').press('Control+Enter');
check('T23 zero-match message', (await text('#status')).includes('No supported identifiers found.'));
check('T23 download label', (await text('#btn-download')) === 'Download copy (no changes)');
check('T23 identical result', (await page.locator('#out-view').innerText()) === 'Meeting moved to Thursday.');

// T26 no transmission after load
check('T26 no requests after load', requests.length === 0, requests.join(', '));
check('T26 no CSP violations', cspErrors.length === 0, cspErrors.join(' | '));
await ctx.setOffline(true);
await page.locator('#btn-sample').click();
check('T26 works offline', (await text('#total')) === '14 to replace');

await page.screenshot({ path: join(tmp, 'desktop.png') });
await page.setViewportSize({ width: 375, height: 800 });
await page.locator('#btn-sample').click();
const noHScroll = await page.evaluate(() => document.documentElement.scrollWidth <= 375);
check('375px: no horizontal scroll', noHScroll);
await page.screenshot({ path: join(tmp, 'mobile.png'), fullPage: true });
console.log(`\nScreenshots: ${tmp}\n${pass} passed, ${fail} failed`);
await browser.close(); server.close();
process.exit(fail ? 1 : 0);
