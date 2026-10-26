import { emptyConfig, validateConfig } from './core.js';

export class ConfigStore {
  constructor(accountId, gm, locks) {
    this.accountId = accountId;
    this.gm = gm;
    this.locks = locks;
    this.key = `byrbt-tools:v1:account:${accountId}`;
    this.subscribers = new Set();
    this.pending = Promise.resolve();
    this.listener = gm.listen(this.key, () => this.notify());
  }
  read() {
    const saved = this.gm.get(this.key, null);
    if (saved === null) return emptyConfig(this.accountId);
    const config = validateConfig(saved);
    if (config.accountId !== this.accountId) throw new Error('保存的账号与当前账号不一致');
    return config;
  }
  subscribe(fn) {
    this.subscribers.add(fn);
    return () => this.subscribers.delete(fn);
  }
  notify() {
    for (const fn of this.subscribers) fn();
  }
  update(mutator) {
    const work = async () => {
      const config = this.read();
      const updated = validateConfig(mutator(config) || config);
      if (updated.accountId !== this.accountId) throw new Error('不允许修改配置归属账号');
      await this.gm.set(this.key, updated);
      this.notify();
      return updated;
    };
    const run = () => (this.locks ? this.locks.request(this.key, work) : work());
    const result = this.pending.then(run, run);
    this.pending = result.catch(() => {});
    return result;
  }
  dispose() {
    this.gm.unlisten(this.listener);
    this.subscribers.clear();
  }
}
