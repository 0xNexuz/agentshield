import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Every package a script, route or the MCP server imports must resolve from the repository root.
// (Removing the wallet bundle once left @near-js/crypto installed only as a nested dependency,
// which broke the owner-signing scripts without failing any other test.)
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const files = ['work', 'api/testnet', 'mcp'].flatMap(dir => fs.readdirSync(path.join(root, dir), { recursive: true })
  .filter(name => /\.(mjs|js)$/.test(name)).map(name => path.join(root, dir, name)));

test('every bare import in work/, api/ and mcp/ resolves', () => {
  const missing = [];
  for (const file of files) {
    const source = fs.readFileSync(file, 'utf8');
    for (const [, spec] of source.matchAll(/(?:from|import)\s*\(?\s*'((?:@[a-z0-9.-]+\/)?[a-z0-9.-]+(?:\/[^']*)?)'/g)) {
      if (spec.startsWith('node:') || spec.startsWith('.')) continue;
      try { import.meta.resolve(spec); } catch { missing.push(`${path.relative(root, file)} → ${spec}`); }
    }
  }
  assert.deepEqual(missing, []);
  assert.ok(files.length > 20);
});
