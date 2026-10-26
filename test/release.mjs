import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';

const pkg = JSON.parse(await readFile('package.json', 'utf8'));
const source = await readFile('dist/byrbt-tools.user.js', 'utf8');
const meta = await readFile('dist/byrbt-tools.meta.js', 'utf8');
const field = (name) => meta.match(new RegExp(`^// @${name}\\s+(.+)$`, 'm'))?.[1];
const release = 'https://github.com/UnbalancedCat/byrbt-tools/releases/latest/download';

test('正式安装包与更新元数据一致，身份和权限保持受限', () => {
  assert.equal(source.slice(0, source.indexOf('// ==/UserScript==') + 18).trim(), meta.trim());
  assert.equal(field('name'), 'BYRBT Tools');
  assert.equal(field('namespace'), 'byrbt-tools');
  assert.equal(field('version'), pkg.version);
  assert.equal(field('author'), 'UnbalancedCat');
  assert.equal(field('license'), 'MIT');
  assert.equal(field('match'), 'https://byr.pt/*');
  assert.equal(field('updateURL'), `${release}/byrbt-tools.meta.js`);
  assert.equal(field('downloadURL'), `${release}/byrbt-tools.user.js`);
  assert.deepEqual(
    [...meta.matchAll(/^\/\/ @grant\s+(.+)$/gm)].map((m) => m[1]).sort(),
    [
      'GM_getValue',
      'GM_setValue',
      'GM_addValueChangeListener',
      'GM_removeValueChangeListener',
      'GM_registerMenuCommand',
      'GM_unregisterMenuCommand',
    ].sort(),
  );
  assert.doesNotMatch(meta, /^\/\/ @(require|connect|resource)\s/m);
  assert.equal(meta.trim().endsWith('// ==/UserScript=='), true);
});

test('安装包包含完整 MIT 许可，校验文件匹配两个发布附件', async () => {
  assert.ok(source.includes((await readFile('LICENSE', 'utf8')).trim()));
  const sums = (await readFile('dist/SHA256SUMS.txt', 'utf8')).trim().split('\n');
  assert.equal(sums.length, 2);
  for (const [index, filename] of ['byrbt-tools.user.js', 'byrbt-tools.meta.js'].entries()) {
    const bytes = await readFile(`dist/${filename}`);
    assert.equal(sums[index], `${createHash('sha256').update(bytes).digest('hex')}  ${filename}`);
  }
  assert.equal(JSON.parse(await readFile('dist/version.json', 'utf8')).version, pkg.version);
});

test('图标内嵌且尺寸正确，不依赖远程图片', async () => {
  for (const [key, size] of [
    ['icon', 32],
    ['icon64', 64],
  ]) {
    const value = field(key);
    assert.ok(value.startsWith('data:image/png;base64,'));
    const png = Buffer.from(value.split(',')[1], 'base64');
    assert.deepEqual(png, await readFile(`assets/icon-${size}.png`));
    assert.equal(png.subarray(1, 4).toString(), 'PNG');
    assert.equal(png.readUInt32BE(16), size);
    assert.equal(png.readUInt32BE(20), size);
  }
});

test('标签版本不符时构建失败且不改写发布包', async () => {
  const result = spawnSync(process.execPath, ['scripts/build.mjs'], {
    env: { ...process.env, GITHUB_REF_TYPE: 'tag', GITHUB_REF_NAME: 'v0.0.0-invalid' },
    encoding: 'utf8',
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Release tag must match/);
  assert.equal(await readFile('dist/byrbt-tools.user.js', 'utf8'), source);
});

test('相同源码重复构建产生完全一致的发布附件', async () => {
  const result = spawnSync(process.execPath, ['scripts/build.mjs'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(await readFile('dist/byrbt-tools.user.js', 'utf8'), source);
  assert.equal(await readFile('dist/byrbt-tools.meta.js', 'utf8'), meta);
});
