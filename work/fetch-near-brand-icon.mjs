import { writeFile } from 'node:fs/promises';

const response = await fetch('https://avatars.githubusercontent.com/u/7613128?v=4', {
  signal: AbortSignal.timeout(12000),
});
if (!response.ok) throw new Error(`NEAR brand icon returned HTTP ${response.status}`);
const bytes = new Uint8Array(await response.arrayBuffer());
await writeFile(new URL('./near-brand-icon.png', import.meta.url), bytes);
console.log(`Saved ${bytes.length} bytes from NEAR's GitHub organization avatar.`);
