// Runs tests/*.test.ts without installing vitest: esbuild aliases 'vitest' to a node:test shim.
import { build } from 'esbuild';
import { readdirSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../../', import.meta.url));
const files = readdirSync(root + 'tests').filter((f) => f.endsWith('.test.ts'));
mkdirSync(root + 'tests/.out', { recursive: true });
const outs = [];
for (const f of files) {
  const out = root + 'tests/' + f.replace('.ts', '.mjs');
  await build({ entryPoints: [root + 'tests/' + f], bundle: true, platform: 'node', format: 'esm', outfile: out,
    alias: { vitest: root + 'scripts/offline/vitest-shim.ts' }, logLevel: 'error' });
  outs.push(out);
}
const r = spawnSync(process.execPath, ['--test', '--test-reporter=spec', ...outs], { stdio: 'inherit' });
process.exit(r.status ?? 1);
