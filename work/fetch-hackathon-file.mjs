import { writeFile } from 'node:fs/promises';

const response = await fetch('https://nearhackathon.com/HACKATHON.md', {
  signal: AbortSignal.timeout(12000),
});
if (!response.ok) throw new Error(`Hackathon file returned HTTP ${response.status}`);
const content = await response.text();
await writeFile(new URL('./HACKATHON-official.md', import.meta.url), content);
console.log(`Saved ${content.length} characters from the official hackathon file.`);
