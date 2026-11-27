// Offline equivalent of `vite build` (used here because vite couldn't be installed).
// Builds two pages — index.html (the app) and welcome.html (the landing page) — into:
//   dist/         multi-file, same CSP as the Vite plugin
//   dist-single/  one self-contained HTML per page, CSP pinned with sha256 hashes
//   dist-hosted/  self-contained, no meta CSP (for hosts that inject their own runtime)
// Usage: node scripts/offline/build.mjs [appUrlForHostedLanding]
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../../', import.meta.url));
const hostedAppUrl = process.argv[2] ?? './index.html';
const base = ["default-src 'self'", "img-src 'self'", "connect-src 'none'", "form-action 'none'", "base-uri 'none'", "object-src 'none'"];
const fonts = ["font-src 'self' https://fonts.gstatic.com"];
for (const d of ['dist', 'dist-single', 'dist-hosted']) { rmSync(root + d, { recursive: true, force: true }); mkdirSync(root + d, { recursive: true }); }

const pages = [
  { html: 'index.html', entry: 'src/main.ts', name: 'app' },
  { html: 'welcome.html', entry: 'src/landing/landing.ts', name: 'landing' },
];
const meta = (c) => `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${c}" />`;
const h = (s) => `'sha256-${createHash('sha256').update(s).digest('base64')}'`;

for (const p of pages) {
  await build({ entryPoints: [root + p.entry], bundle: true, minify: true, format: 'esm', target: 'es2022',
    outdir: root + 'dist/assets', entryNames: p.name, logLevel: 'error' });
  const html = readFileSync(root + p.html, 'utf8');
  const tag = `<script type="module" src="/${p.entry}"></script>`;
  if (!html.includes(tag)) throw new Error(`script tag not found in ${p.html}`);
  const csp = [...base, "script-src 'self'", "style-src 'self' https://fonts.googleapis.com", ...fonts].join('; ');
  writeFileSync(root + 'dist/' + p.html, html.replace('<meta charset="UTF-8" />', meta(csp))
    .replace(tag, `<script type="module" src="./assets/${p.name}.js"></script>`)
    .replace('</head>', `  <link rel="stylesheet" href="./assets/${p.name}.css" />\n  </head>`));

  const js = readFileSync(root + `dist/assets/${p.name}.js`, 'utf8').replace(/<\/script/gi, '<\\/script');
  const css = readFileSync(root + `dist/assets/${p.name}.css`, 'utf8');
  const inline = (s) => s.replace(tag, () => `<script type="module">${js}</script>`).replace('</head>', () => `  <style>${css}</style>\n  </head>`);
  const csp1 = [...base, `script-src ${h(js)}`, `style-src ${h(css)} https://fonts.googleapis.com`, ...fonts].join('; ');
  writeFileSync(root + 'dist-single/' + p.html, inline(html.replace('<meta charset="UTF-8" />', meta(csp1))));
  let hosted = inline(html);
  if (p.name === 'landing') hosted = hosted.replaceAll('href="./index.html" data-app-link', `href="${hostedAppUrl}" data-app-link`);
  writeFileSync(root + 'dist-hosted/' + p.html, hosted);
}
console.log('built app + landing');
