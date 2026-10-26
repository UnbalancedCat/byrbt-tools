import test from 'node:test';
import assert from 'node:assert/strict';
import { DraftSession, DraftConflict, reconcile } from '../src/drafts.js';
import { ConfigStore } from '../src/store.js';
import { emptyConfig, addUser } from '../src/core.js';
import { ACCOUNT, BLOCKED, OTHER, memoryGM } from './helpers.js';
const clone = (c) => structuredClone(c);
test('不同 UID 与不同规则字段三方合并，旧草稿不覆盖远端添加', () => {
  const base = emptyConfig(ACCOUNT),
    l = addUser(clone(base), BLOCKED),
    r = addUser(clone(base), OTHER);
  l.defaults.resource = true;
  r.defaults.identity = true;
  const merged = reconcile(base, l, r);
  assert.equal(merged.conflicts.length, 0);
  assert.deepEqual(Object.keys(merged.config.users).sort(), [BLOCKED, OTHER].sort());
  assert.equal(merged.config.defaults.resource, true);
  assert.equal(merged.config.defaults.identity, true);
});
test('相同用户不同覆盖字段可合并，相同修改无冲突', () => {
  const base = addUser(emptyConfig(ACCOUNT), BLOCKED),
    l = clone(base),
    r = clone(base);
  l.users[BLOCKED].overrides.resource = true;
  r.users[BLOCKED].overrides.identity = false;
  assert.deepEqual(reconcile(base, l, r).config.users[BLOCKED].overrides, {
    resource: true,
    identity: false,
  });
  assert.equal(reconcile(base, l, l).conflicts.length, 0);
});
test('删除与远端编辑冲突，选择只对相同三方值有效', () => {
  const base = addUser(emptyConfig(ACCOUNT), BLOCKED),
    l = clone(base),
    r = clone(base);
  delete l.users[BLOCKED];
  r.users[BLOCKED].name = '远端名字';
  const conflict = reconcile(base, l, r).conflicts[0];
  assert.equal(conflict.path, `users.${BLOCKED}`);
  const choices = { [conflict.path]: { token: conflict.token, side: 'local' } };
  assert.equal(reconcile(base, l, r, choices).config.users[BLOCKED], undefined);
  r.users[BLOCKED].name = '再次修改';
  assert.equal(reconcile(base, l, r, choices).conflicts.length, 1);
});
test('同一覆盖从继承分别改为开与关时必须解决冲突', () => {
  const base = addUser(emptyConfig(ACCOUNT), BLOCKED),
    l = clone(base),
    r = clone(base);
  l.users[BLOCKED].overrides.identity = true;
  r.users[BLOCKED].overrides.identity = false;
  const conflict = reconcile(base, l, r).conflicts[0];
  const choices = { [conflict.path]: { token: conflict.token, side: 'remote' } };
  assert.equal(reconcile(base, l, r, choices).config.users[BLOCKED].overrides.identity, false);
});
test('批量草稿操作异常是原子的，不留下部分添加', () => {
  const s = new DraftSession(new ConfigStore(ACCOUNT, memoryGM()));
  assert.throws(() =>
    s.edit((c) => {
      addUser(c, BLOCKED);
      addUser(c, ACCOUNT);
    }),
  );
  assert.equal(s.dirty, false);
  assert.equal(s.value.users[BLOCKED], undefined);
});
test('保存在锁内读取最新配置，重复远端通知不覆盖脏草稿', async () => {
  const gm = memoryGM(),
    store = new ConfigStore(ACCOUNT, gm),
    s = new DraftSession(store);
  s.edit((c) => addUser(c, BLOCKED));
  await store.update((c) => addUser(c, OTHER));
  s.remoteChanged();
  s.remoteChanged();
  assert.ok(s.value.users[BLOCKED]);
  assert.equal(s.value.users[OTHER], undefined);
  await s.save();
  assert.ok(store.read().users[OTHER]);
  assert.ok(store.read().users[BLOCKED]);
  assert.equal(s.dirty, false);
});
test('保存冲突不写库，失败后保留草稿', async () => {
  const base = addUser(emptyConfig(ACCOUNT), BLOCKED),
    gm = memoryGM({ [`byrbt-tools:v1:account:${ACCOUNT}`]: base }),
    store = new ConfigStore(ACCOUNT, gm),
    s = new DraftSession(store);
  s.edit((c) => {
    delete c.users[BLOCKED];
  });
  await store.update((c) => {
    c.users[BLOCKED].name = '改变';
  });
  await assert.rejects(s.save(), DraftConflict);
  assert.equal(s.dirty, true);
  assert.equal(store.read().users[BLOCKED].name, '改变');
  gm.set = () => {
    throw new Error('存储失败');
  };
  s.reset();
  s.edit((c) => addUser(c, OTHER));
  await assert.rejects(s.save(), /存储失败/);
  assert.equal(s.dirty, true);
});

test('重复通知不使未修改会话过期；账号切换取消排队保存', async () => {
  const store = new ConfigStore(ACCOUNT, memoryGM()),
    session = new DraftSession(store);
  const epoch = session.epoch;
  session.remoteChanged();
  session.remoteChanged();
  assert.equal(session.epoch, epoch);
  session.edit((c) => addUser(c, BLOCKED));
  const saving = session.save();
  session.invalidate();
  await assert.rejects(saving, /编辑会话已结束/);
  assert.equal(store.read().users[BLOCKED], undefined);
});
