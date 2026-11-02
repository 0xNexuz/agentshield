import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
await build({
  absWorkingDir: root,
  entryPoints: [resolve(root, 'frontend/wallet-entry.mjs')],
  outfile: resolve(root, 'outputs/agentshield-ui/wallet-bundle.js'),
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  alias: { util: 'util/' },
  inject: [resolve(root, 'work/browser-shims.mjs')],
  define: { global: 'globalThis' },
});
