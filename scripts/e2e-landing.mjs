// Browser checks for the landing page (welcome.html). Usage: node scripts/e2e-landing.mjs [dir]
import { chromium } from 'playwright';
import http from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';

const dir = process.argv[2] ?? 'dist';
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const server = http.createServer((req, res) => {
  const p = join(dir, req.url === '/' ? 'welcome.html' : req.url.split('?')[0]);
  if (!existsSync(p)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': types[extname(p)] ?? 'application/octet-stream' });
  res.end(readFileSync(p));
}).listen(0);
const url = `http://127.0.0.1:${server.address().port}/welcome.html`;
let pass = 0, fail = 0;
const check = (name, ok, detail = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : ' — ' + detail}`); };

const browser = await chromium.launch();
for (const motion of ['no-preference', 'reduce']) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: motion });
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g/.test(m.text() + (m.location().url ?? ''))) errors.push(m.text() + ' @ ' + m.location().url); });
  await page.goto(url);
  const reqs = []; page.on('request', (r) => reqs.push(r.url()));
  const tag = `[${motion}]`;

  check(`${tag} no JS or CSP errors`, errors.length === 0, errors.join(' | '));
  const links = await page.locator('[data-app-link]').evaluateAll((as) => as.map((a) => a.getAttribute('href')));
  check(`${tag} 4 buttons link to the app`, links.length === 4 && links.every((h) => h === './index.html'), links.join(','));
  check(`${tag} h1 present`, (await page.locator('h1').count()) === 1);

  // scroll through so reveals fire
  for (let y = 0; y < 9000; y += 600) { await page.mouse.wheel(0, 600); await page.waitForTimeout(60); }
  await page.waitForTimeout(1200);
  const hidden = await page.locator('.reveal:not(.in)').count();
  check(`${tag} all reveal blocks became visible`, hidden === 0, `${hidden} hidden`);

  // demo uses the real engine
  const out = page.locator('#demo-out');
  check(`${tag} demo pseudonymizes`, /EMAIL_01/.test(await out.innerText()) && !/ravi\.k@/.test(await out.innerText()), await out.innerText());
  check(`${tag} demo count`, (await page.locator('#demo-count').innerText()) === '6 items replaced', await page.locator('#demo-count').innerText());
  check(`${tag} same phone → one alias`, ((await out.innerText()).match(/PHONE_01/g) ?? []).length === 2);
  await page.locator('input[name="dmode"][value="full"]').check({ force: true });
  check(`${tag} demo full mask`, ((await out.innerText()).match(/\[REDACTED\]/g) ?? []).length === 6);
  await page.locator('#demo-in').fill('Meeting moved to Thursday.');
  await page.waitForTimeout(300);
  check(`${tag} demo zero matches`, (await page.locator('#demo-count').innerText()) === 'Nothing to replace');
  await page.locator('#demo-in').fill('<img src=x onerror=alert(1)> a@example.com');
  await page.waitForTimeout(300);
  check(`${tag} demo renders HTML as text`, (await out.locator('img').count()) === 0 && (await out.innerText()).includes('<img'));

  // prism
  await page.locator('.mode-tab[data-face="2"]').click();
  check(`${tag} prism tab selects`, (await page.locator('.mode-tab[data-face="2"]').getAttribute('aria-selected')) === 'true');
  const tf = await page.locator('#prism').evaluate((el) => el.style.transform);
  check(`${tag} prism rotates`, /rotateX\(-\d+deg\)/.test(tf), tf);
  await page.keyboard.press('ArrowDown');
  check(`${tag} prism keyboard`, (await page.locator('.mode-tab[data-face="0"]').getAttribute('aria-selected')) === 'true');

  check(`${tag} no network requests after load`, reqs.length === 0, reqs.join(', '));
  check(`${tag} live counter shows 0`, (await page.locator('[data-net-mirror]').first().innerText()) === '0');

  // tilt/rig run without errors under motion
  await page.mouse.move(1000, 300); await page.waitForTimeout(400);
  check(`${tag} still no errors after interaction`, errors.length === 0, errors.join(' | '));

  // button opens the app
  await page.locator('[data-app-link]').first().click();
  await page.waitForURL(/index\.html$/);
  await page.locator('#btn-sample').click();
  check(`${tag} app opens from landing and works`, (await page.locator('#total').innerText()) === '14 to replace');
  await page.close();
}

for (const w of [375, 768]) {
  const page = await browser.newPage({ viewport: { width: w, height: 800 } });
  await page.route(/fonts\./, (r) => r.abort());
  await page.goto(url);
  const sw = await page.evaluate(() => document.documentElement.scrollWidth);
  check(`${w}px: no horizontal scroll`, sw <= w, `scrollWidth ${sw}`);
  await page.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
await browser.close(); server.close();
process.exit(fail ? 1 : 0);
