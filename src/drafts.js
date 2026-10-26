import { LAYERS, validateConfig } from './core.js';

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
export const snapshot = (c) => JSON.stringify(validateConfig(c));

export class DraftConflict extends Error {
  constructor(conflicts) {
    super('其他标签页也修改了这些项目，请逐项选择后再次保存。');
    this.conflicts = conflicts;
  }
}

export function reconcile(base, local, remote, choices = {}) {
  base = validateConfig(base);
  local = validateConfig(local);
  remote = validateConfig(remote);
  if (base.accountId !== local.accountId || base.accountId !== remote.accountId)
    throw new Error('配置账号已变化');
  const result = validateConfig(remote),
    conflicts = [];
  function merge(path, b, l, r) {
    if (same(l, b)) return r;
    if (same(r, b) || same(l, r)) return l;
    const token = JSON.stringify([b, l, r]);
    const choice = choices[path];
    if (choice?.token === token && ['local', 'remote'].includes(choice.side))
      return choice.side === 'local' ? l : r;
    conflicts.push({ path, base: b, local: l, remote: r, token });
    return r;
  }
  for (const layer of LAYERS)
    result.defaults[layer] = merge(
      `defaults.${layer}`,
      base.defaults[layer],
      local.defaults[layer],
      remote.defaults[layer],
    );
  const ids = new Set([
    ...Object.keys(base.users),
    ...Object.keys(local.users),
    ...Object.keys(remote.users),
  ]);
  result.users = {};
  for (const id of ids) {
    const b = base.users[id],
      l = local.users[id],
      r = remote.users[id];
    if (!b || !l || !r) {
      const user = merge(`users.${id}`, b, l, r);
      if (user) result.users[id] = user;
      continue;
    }
    const user = {
      uid: id,
      name: merge(`users.${id}.name`, b.name, l.name, r.name),
      overrides: {},
    };
    for (const layer of LAYERS) {
      const value = merge(
        `users.${id}.${layer}`,
        b.overrides[layer],
        l.overrides[layer],
        r.overrides[layer],
      );
      if (value !== undefined) user.overrides[layer] = value;
    }
    result.users[id] = user;
  }
  return { config: validateConfig(result), conflicts };
}

export class DraftSession {
  constructor(store) {
    this.store = store;
    this.epoch = 0;
    this.reset();
  }
  get dirty() {
    return snapshot(this.base) !== snapshot(this.value);
  }
  reset() {
    this.epoch++;
    this.base = this.store.read();
    this.value = validateConfig(this.base);
  }
  edit(mutator) {
    const copy = validateConfig(this.value);
    this.value = validateConfig(mutator(copy) || copy);
  }
  remoteChanged() {
    if (!this.dirty && snapshot(this.base) !== snapshot(this.store.read())) this.reset();
  }
  async save(choices = {}) {
    const base = validateConfig(this.base),
      local = validateConfig(this.value),
      epoch = this.epoch;
    await this.store.update((latest) => {
      if (this.epoch !== epoch) throw new Error('编辑会话已结束，未保存过期修改');
      const merged = reconcile(base, local, latest, choices);
      if (merged.conflicts.length) throw new DraftConflict(merged.conflicts);
      return merged.config;
    });
    this.reset();
  }
  invalidate() {
    this.epoch++;
  }
}
