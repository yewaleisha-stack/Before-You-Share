// Offline equivalent of `vite build` (used here because vite couldn't be installed).
// Produces dist/ (index.html + assets) with the same CSP, and dist-single/index.html
// with JS/CSS inlined and pinned by sha256 hashes in the CSP.
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../../', import.meta.url));
const base = [
  "default-src 'self'", "img-src 'self'", "connect-src 'none'", "form-action 'none'", "base-uri 'none'", "object-src 'none'",
];
const fonts = ["font-src 'self' https://fonts.gstatic.com"];
rmSync(root + 'dist', { recursive: true, force: true });
rmSync(root + 'dist-single', { recursive: true, force: true });
rmSync(root + 'dist-hosted', { recursive: true, force: true });
await build({ entryPoints: [root + 'src/main.ts'], bundle: true, minify: true, format: 'esm', target: 'es2022',
  outdir: root + 'dist/assets', entryNames: 'app', logLevel: 'error' });
let html = readFileSync(root + 'index.html', 'utf8');
const csp = [...base, "script-src 'self'", "style-src 'self' https://fonts.googleapis.com", ...fonts].join('; ');
const meta = (c) => `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${c}" />`;
const multi = html.replace('<meta charset="UTF-8" />', meta(csp))
  .replace('<script type="module" src="/src/main.ts"></script>', '<script type="module" src="./assets/app.js"></script>')
  .replace('</head>', '  <link rel="stylesheet" href="./assets/app.css" />\n  </head>');
writeFileSync(root + 'dist/index.html', multi);

const js = readFileSync(root + 'dist/assets/app.js', 'utf8').replace(/<\/script/gi, '<\\/script');
const css = readFileSync(root + 'dist/assets/app.css', 'utf8');
const h = (s) => `'sha256-${createHash('sha256').update(s).digest('base64')}'`;
const csp1 = [...base, `script-src ${h(js)}`, `style-src ${h(css)} https://fonts.googleapis.com`, ...fonts].join('; ');
mkdirSync(root + 'dist-single', { recursive: true });
const single = html.replace('<meta charset="UTF-8" />', meta(csp1))
  .replace('<script type="module" src="/src/main.ts"></script>', () => `<script type="module">${js}</script>`)
  .replace('</head>', () => `  <style>${css}</style>\n  </head>`);
writeFileSync(root + 'dist-single/index.html', single);
console.log('built', single.length, 'bytes single-file');

// dist-hosted: same single file without the meta CSP, for hosts that inject their own
// runtime and enforce their own CSP (e.g. a claude.ai hosted page).
mkdirSync(root + 'dist-hosted', { recursive: true });
const hosted = html
  .replace('<script type="module" src="/src/main.ts"></script>', () => `<script type="module">${js}</script>`)
  .replace('</head>', () => `  <style>${css}</style>\n  </head>`);
writeFileSync(root + 'dist-hosted/index.html', hosted);
