import { Resvg } from '@resvg/resvg-js';
import { readFile, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const svg = await readFile(new URL('../assets/icon.svg', import.meta.url));
for (const size of [32, 64]) {
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render().asPng();
  const path = new URL(`../assets/icon-${size}.png`, import.meta.url);
  if (process.argv.includes('--check'))
    assert.deepEqual(await readFile(path), png, `Rebuild icon-${size}.png with npm run icons`);
  else await writeFile(path, png);
}
console.log(
  process.argv.includes('--check') ? 'Icons match SVG source' : 'Generated 32/64px icons',
);
