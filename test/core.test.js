import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeUid,
  uidFromHref,
  parseUserInput,
  emptyConfig,
  addUser,
  shouldBlock,
  mergeConfig,
  validateConfig,
  currentAccount,
  nativeBlacklist,
} from '../src/core.js';
import { ConfigStore } from '../src/store.js';
import { ACCOUNT, BLOCKED, OTHER, page, link, memoryGM } from './helpers.js';

test('UID 精确规范化，不做子串匹配', () => {
  assert.equal(normalizeUid(' 0010001 '), BLOCKED);
  for (const v of ['0', '-2', '1e4', '10001x', null, {}, '1.5'])
    assert.equal(normalizeUid(v), null);
  const c = addUser(emptyConfig(ACCOUNT), BLOCKED);
  assert.ok(shouldBlock(c, BLOCKED, 'interaction'));
  assert.ok(!shouldBlock(c, OTHER, 'interaction'));
});
test('仅识别本站个人页，允许参数重排而拒绝重复参数及伪造域名', () => {
  for (const href of [
    '/userdetails.php?id=10001',
    'userdetails.php?x=1&id=10001#top',
    'https://byr.pt/userdetails.php?id=10001',
  ])
    assert.equal(uidFromHref(href), BLOCKED);
  for (const href of [
    'https://evil.example/userdetails.php?id=10001',
    'https://byr.pt.evil.example/userdetails.php?id=10001',
    '/details.php?id=10001',
    '/userdetails.php?id=10001&id=123',
    'javascript:alert(1)',
    'http://byr.pt/userdetails.php?id=10001',
  ])
    assert.equal(uidFromHref(href), null);
  assert.equal(parseUserInput(BLOCKED), BLOCKED);
});
test('三层默认值、单人覆盖、站务豁免与自身保护', () => {
  const c = addUser(emptyConfig(ACCOUNT), BLOCKED);
  assert.deepEqual(c.defaults, { interaction: true, resource: false, identity: false });
  c.users[BLOCKED].overrides = { interaction: false, identity: true };
  assert.ok(!shouldBlock(c, BLOCKED, 'interaction'));
  assert.ok(shouldBlock(c, BLOCKED, 'identity'));
  assert.ok(!shouldBlock(c, BLOCKED, 'identity', true));
  assert.throws(() => addUser(c, ACCOUNT));
});
test('导入跨账号合并，已有规则优先、导入自身排除', () => {
  const c = addUser(emptyConfig(ACCOUNT), BLOCKED);
  c.users[BLOCKED].overrides.resource = false;
  const b = addUser(addUser(emptyConfig('999'), BLOCKED), OTHER);
  addUser(b, ACCOUNT);
  b.users[BLOCKED].overrides.resource = true;
  b.users[OTHER].overrides.identity = true;
  b.defaults.identity = true;
  const merged = mergeConfig(c, b);
  assert.equal(merged.accountId, ACCOUNT);
  assert.equal(merged.users[BLOCKED].overrides.resource, false);
  assert.equal(merged.users[OTHER].overrides.identity, true);
  assert.equal(merged.defaults.identity, false);
  assert.ok(!merged.users[ACCOUNT]);
});
test('非法导入整体拒绝，不污染原对象', () => {
  const c = emptyConfig(ACCOUNT);
  assert.throws(() => mergeConfig(c, { ...c, version: 2 }));
  assert.throws(() => mergeConfig(c, { ...c, users: { bad: { uid: BLOCKED } } }));
  assert.throws(() => validateConfig({ ...c, defaults: { interaction: 'false' } }));
  assert.deepEqual(c.users, {});
});
test('展示名按纯文本保存，不作为身份', () => {
  const c = addUser(emptyConfig(ACCOUNT), BLOCKED, '<img src=x onerror=alert(1)>');
  assert.equal(c.users[BLOCKED].uid, BLOCKED);
  assert.ok(!shouldBlock(c, '<img src=x>', 'interaction'));
});
test('账号仅从站点导航读取', () => {
  const dom = page(link(OTHER));
  assert.equal(currentAccount(dom.window.document), ACCOUNT);
  dom.window.document.querySelector('#info_block').remove();
  assert.equal(currentAccount(dom.window.document), null);
  dom.window.close();
});
test('只导入 type=block 且有对应 UID 链接的黑名单条目', () => {
  const dom = page(
    `<table><tr><td><a href="friends.php?action=delete&type=friend&targetid=${OTHER}">删好友</a>${link(OTHER)}</td></tr><tr><td><a href="friends.php?action=delete&type=block&targetid=${BLOCKED}">D</a>${link(BLOCKED)}</td></tr></table>`,
    '/friends.php',
  );
  assert.deepEqual(nativeBlacklist(dom.window.document), [{ uid: BLOCKED, name: '示例用户' }]);
  dom.window.close();
});
test('存储隔离、远端通知及连续更新不覆盖已有用户', async () => {
  const gm = memoryGM();
  const a = new ConfigStore(ACCOUNT, gm),
    b = new ConfigStore(ACCOUNT, gm),
    other = new ConfigStore('999', gm);
  let notified = 0;
  b.subscribe(() => notified++);
  await Promise.all([a.update((c) => addUser(c, BLOCKED)), a.update((c) => addUser(c, OTHER))]);
  assert.deepEqual(Object.keys(b.read().users).sort(), [BLOCKED, OTHER].sort());
  assert.ok(notified >= 2);
  assert.deepEqual(other.read().users, {});
  a.dispose();
  b.dispose();
  other.dispose();
});
test('损坏的已存数据不会静默重置', () => {
  const gm = memoryGM({ [`byrbt-tools:v1:account:${ACCOUNT}`]: { version: 22 } });
  const s = new ConfigStore(ACCOUNT, gm);
  assert.throws(() => s.read());
  assert.equal(gm.data.values().next().value.version, 22);
  s.dispose();
});
