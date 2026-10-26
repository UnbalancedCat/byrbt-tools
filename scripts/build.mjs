import { build } from 'esbuild';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url)));
const license = (await readFile(new URL('../LICENSE', import.meta.url), 'utf8')).trim();
const repo = 'https://github.com/UnbalancedCat/byrbt-tools';
const release = `${repo}/releases/latest/download`;
const icon = async (size) =>
  `data:image/png;base64,${(await readFile(new URL(`../assets/icon-${size}.png`, import.meta.url))).toString('base64')}`;
if (process.env.GITHUB_REF_TYPE === 'tag' && process.env.GITHUB_REF_NAME !== `v${pkg.version}`)
  throw new Error('Release tag must match package.json version');
const header = `// ==UserScript==
// @name         BYRBT Tools
// @namespace    byrbt-tools
// @version      ${pkg.version}
// @description  BYRBT 第三方工具箱：按 UID 屏蔽用户，支持群聊、趣味盒、评论及分层规则
// @author       UnbalancedCat
// @license      MIT
// @copyright    2026, UnbalancedCat
// @homepageURL  ${repo}
// @supportURL   ${repo}/issues
// @updateURL    ${release}/byrbt-tools.meta.js
// @downloadURL  ${release}/byrbt-tools.user.js
// @icon         ${await icon(32)}
// @icon64       ${await icon(64)}
// @match        https://byr.pt/*
// @run-at       document-end
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_addValueChangeListener
// @grant        GM_removeValueChangeListener
// @grant        GM_registerMenuCommand
// @grant        GM_unregisterMenuCommand
// ==/UserScript==`;
await mkdir('dist', { recursive: true });
await build({
  entryPoints: ['src/main.js'],
  bundle: true,
  format: 'iife',
  target: ['chrome120'],
  outfile: 'dist/byrbt-tools.user.js',
  banner: { js: `${header}\n\n/*\n${license}\n*/` },
  charset: 'utf8',
  legalComments: 'none',
});
await writeFile('dist/byrbt-tools.meta.js', `${header}\n`);
await writeFile('dist/version.json', JSON.stringify({ version: pkg.version }, null, 2) + '\n');
const checksums = [];
for (const name of ['byrbt-tools.user.js', 'byrbt-tools.meta.js']) {
  const digest = createHash('sha256')
    .update(await readFile(`dist/${name}`))
    .digest('hex');
  checksums.push(`${digest}  ${name}`);
}
await writeFile('dist/SHA256SUMS.txt', `${checksums.join('\n')}\n`);
console.log(`Built dist/byrbt-tools.user.js (${pkg.version})`);
