import { collectUnits } from './adapters.js';
import { shouldBlock } from './core.js';

export const EFFECT_CSS = `
.byrbt-hidden{display:none!important}
a.byrbt-masked{font-size:0!important} a.byrbt-masked>*{display:none!important}
a.byrbt-masked::after{content:'已屏蔽用户';font-size:12px;color:#888}
`;

export class Renderer {
  constructor() {
    this.effects = new Map();
  }
  sync(units, reveal = false) {
    const next = new Map();
    if (!reveal)
      for (const unit of units)
        for (const node of unit.targets) {
          if (node.isConnected && (unit.mode === 'hide' || !next.has(node)))
            next.set(node, unit.mode);
        }
    for (const [node, prior] of this.effects)
      if (!next.has(node) || next.get(node) !== prior.mode) {
        node.classList.remove(prior.mode === 'hide' ? 'byrbt-hidden' : 'byrbt-masked');
        if (prior.mode === 'mask')
          for (const [key, value] of Object.entries(prior.attrs))
            value === null ? node.removeAttribute(key) : node.setAttribute(key, value);
        this.effects.delete(node);
      }
    for (const [node, mode] of next)
      if (!this.effects.has(node)) {
        const attrs = {};
        if (mode === 'mask') {
          for (const attr of ['title', 'aria-label']) attrs[attr] = node.getAttribute(attr);
          node.removeAttribute('title');
          node.setAttribute('aria-label', '已屏蔽用户');
        }
        node.classList.add(mode === 'hide' ? 'byrbt-hidden' : 'byrbt-masked');
        this.effects.set(node, { mode, attrs });
      }
    // Site scripts may replace className on existing nodes rather than replacing the node.
    for (const [node, mode] of next)
      node.classList.add(mode === 'hide' ? 'byrbt-hidden' : 'byrbt-masked');
  }
  clear() {
    this.sync([]);
  }
}

export class Engine {
  constructor(doc, { getConfig, getContext = () => ({}), onChange = () => {} }) {
    this.doc = doc;
    this.getConfig = getConfig;
    this.getContext = getContext;
    this.onChange = onChange;
    this.units = [];
    this.renderer = new Renderer();
    this.reveal = false;
    this.disposed = false;
    this.scopes = new Set();
    this.scheduled = false;
    this.style = doc.createElement('style');
    this.style.dataset.byrbtUi = 'style';
    this.style.textContent = EFFECT_CSS;
    (doc.head || doc.documentElement).append(this.style);
    this.observer = new doc.defaultView.MutationObserver((records) => this.onMutations(records));
    this.refresh();
    this.observe();
  }
  observe() {
    if (!this.disposed)
      this.observer.observe(this.doc.documentElement, {
        childList: true,
        subtree: true,
        characterData: true,
        attributes: true,
        attributeFilter: ['href', 'class', 'data-author-id'],
      });
  }
  refresh() {
    this.units = collectUnits(this.doc, this.doc, this.getContext());
    this.render();
  }
  render() {
    this.observer.disconnect();
    this.units = this.units.filter(
      (u) => u.anchor.isConnected && u.targets.every((n) => n.isConnected),
    );
    const config = this.getConfig();
    const blocked = this.units.filter((u) =>
      shouldBlock(config, u.uid, u.layer, u.protectedContent),
    );
    this.renderer.sync(blocked, this.reveal);
    const hideTargets = new Set(blocked.filter((u) => u.mode === 'hide').flatMap((u) => u.targets));
    // Count logical units; duplicate identity effects inside an already hidden unit don't add to it.
    this.count = blocked.filter(
      (u, i, all) =>
        !all.slice(0, i).some((x) => x.targets.some((t) => u.targets.includes(t))) &&
        ![...hideTargets].some(
          (t) => !u.targets.includes(t) && u.targets.every((n) => t.contains(n)),
        ),
    ).length;
    this.observe();
    this.onChange(this.count, this.reveal);
  }
  onMutations(records) {
    for (const r of records) {
      const el = r.target.nodeType === 1 ? r.target : r.target.parentElement;
      if (!el || el.closest('[data-byrbt-ui],#info_block,#nav_block,.nav_block,#header')) continue;
      if (
        r.type === 'childList' &&
        r.addedNodes.length &&
        [...r.addedNodes].every((n) => n.nodeType === 1 && n.hasAttribute('data-byrbt-ui')) &&
        !r.removedNodes.length
      )
        continue;
      const root =
        el.closest(
          '.shoutrow,.fun-chat-row,table.comment-table,table[id^="pid"],table.coltable,table.torrents',
        ) || el;
      this.scopes.add(root);
    }
    if (this.scopes.size && !this.scheduled) {
      this.scheduled = true;
      this.doc.defaultView.queueMicrotask(() => this.flush());
    }
  }
  flush() {
    if (this.disposed) return;
    this.scheduled = false;
    const scopes = [...this.scopes].filter((n) => n.isConnected);
    this.scopes.clear();
    const roots = scopes.filter((n) => !scopes.some((other) => other !== n && other.contains(n)));
    for (const root of roots) {
      const next = collectUnits(this.doc, root, this.getContext());
      // Reconcile stable anchor + adapter key, including a changed author/href.
      this.units = this.units.filter(
        (u) =>
          u.anchor.isConnected &&
          !root.contains(u.anchor) &&
          !next.some((n) => n.anchor === u.anchor && n.key === u.key),
      );
      this.units.push(...next);
    }
    this.render();
  }
  setReveal(value) {
    this.reveal = Boolean(value);
    this.render();
  }
  dispose() {
    this.disposed = true;
    this.observer.disconnect();
    this.renderer.clear();
    this.style.remove();
    this.units = [];
  }
}
