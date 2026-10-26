import { currentAccount, SITE } from './core.js';
import { ConfigStore } from './store.js';
import { Engine } from './engine.js';
import { findFunOwner } from './adapters.js';
import { mountUI, attachQuickActions } from './ui.js';

export async function start(win, gm) {
  const doc = win.document;
  if (new URL(doc.URL).origin !== SITE) return;
  // The topmost same-origin coordinator owns all its iframe engines, avoiding duplicates.
  try {
    if (win.parent !== win && win.parent.location.origin === SITE) return;
  } catch {
    /* cross-origin embed: own coordinator */
  }
  const fetchPage = async (path) => {
    const response = await win.fetch(new URL(path, SITE), {
      credentials: 'same-origin',
      cache: 'no-store',
      signal: win.AbortSignal.timeout(15000),
    });
    if (!response.ok || new URL(response.url).origin !== SITE) throw new Error('站内页面读取失败');
    return response.text();
  };
  let accountId = currentAccount(doc),
    reason = '';
  if (
    !accountId &&
    (/^\/fun\//.test(win.location.pathname) || win.location.pathname === '/shoutbox.php')
  ) {
    try {
      const html = await fetchPage('/index.php');
      accountId = currentAccount(new win.DOMParser().parseFromString(html, 'text/html'));
    } catch {
      reason = '无法确认独立查看页的登录账号，未启用名单。刷新后可重试。';
    }
  }
  let store, config;
  if (accountId)
    try {
      store = new ConfigStore(accountId, gm, win.navigator.locks);
      config = store.read();
    } catch (e) {
      store?.dispose();
      store = null;
      reason = `配置未加载：${e.message}。原配置保持不变。`;
    }
  const sessions = new Map();
  let reveal = false,
    disposed = false,
    ui,
    identityObserver;
  const count = () => [...sessions.values()].reduce((sum, s) => sum + (s.engine.count || 0), 0);
  const onFrameLoad = (event) => {
    if (event.target?.tagName === 'IFRAME') refreshFrames();
  };
  const refreshFrames = () => {
    if (disposed || !store) return;
    for (const [d, s] of sessions)
      if (s.frame && (!s.frame.isConnected || s.frame.contentDocument !== d)) {
        s.observer.disconnect();
        s.engine.dispose();
        s.quick.dispose();
        d.removeEventListener('load', onFrameLoad, true);
        sessions.delete(d);
      }
    for (const [d] of sessions)
      for (const frame of d.querySelectorAll('iframe')) {
        try {
          const child = frame.contentDocument;
          if (child?.documentElement && new URL(child.URL).origin === SITE && !sessions.has(child))
            attach(child, frame);
        } catch {
          /* opaque/cross-origin frame */
        }
      }
    ui?.counts();
  };
  const attach = (d, frame = null) => {
    const engine = new Engine(d, {
      getConfig: () => config,
      getContext: () => ({ funOwner: frame ? findFunOwner(frame.ownerDocument, frame.src) : null }),
      onChange: () => ui?.counts(),
    });
    engine.setReveal(reveal);
    const quick = attachQuickActions(d, {
      accountId,
      getConfig: () => config,
      toggle: (id, name) => ui.toggle(id, name),
      reportError: (message) => ui.showError(message),
    });
    const observer = new d.defaultView.MutationObserver((records) => {
      if (
        records.some((r) =>
          [...r.addedNodes, ...r.removedNodes].some(
            (n) => n.nodeType === 1 && (n.tagName === 'IFRAME' || n.querySelector?.('iframe')),
          ),
        )
      )
        refreshFrames();
    });
    observer.observe(d.documentElement, { childList: true, subtree: true });
    d.addEventListener('load', onFrameLoad, true);
    sessions.set(d, { engine, quick, frame, observer });
  };
  ui = mountUI(doc, {
    store,
    inactiveReason: reason,
    onReveal: (value) => {
      reveal = value;
      for (const s of sessions.values()) s.engine.setReveal(value);
      ui.counts();
    },
    getReveal: () => reveal,
    getCount: count,
    fetchPage,
  });
  if (store) {
    attach(doc);
    refreshFrames();
    store.subscribe(() => {
      try {
        config = store.read();
        for (const s of sessions.values()) {
          s.engine.refresh();
          s.quick.refresh();
        }
        ui.refresh();
      } catch (e) {
        ui.showError(e.message);
      }
    });
    const header = doc.querySelector('#info_block') || doc.querySelector('#nav_block,.nav_block');
    if (header) {
      identityObserver = new win.MutationObserver(() => {
        const next = currentAccount(doc);
        if (next !== accountId) {
          cleanup();
          start(win, gm).catch((e) => console.error('[BYRBT Tools]', e.message));
        }
      });
      identityObserver.observe(header, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['href'],
      });
    }
  }
  const menu = gm.menu?.('BYRBT：工具箱', () => ui.open());
  const cleanup = () => {
    if (disposed) return;
    disposed = true;
    for (const [d, s] of sessions) {
      s.observer.disconnect();
      s.engine.dispose();
      s.quick.dispose();
      d.removeEventListener('load', onFrameLoad, true);
    }
    sessions.clear();
    identityObserver?.disconnect();
    store?.dispose();
    ui.dispose();
    if (menu !== undefined) gm.unmenu?.(menu);
    win.removeEventListener('pagehide', cleanup);
  };
  win.addEventListener('pagehide', cleanup, { once: true });
  return { dispose: cleanup };
}

const gmAvailable = typeof GM_getValue === 'function' && typeof GM_setValue === 'function';
if (gmAvailable) {
  const gm = {
    get: (k, v) => GM_getValue(k, v),
    set: (k, v) => GM_setValue(k, v),
    listen: (k, f) => GM_addValueChangeListener(k, f),
    unlisten: (id) => GM_removeValueChangeListener(id),
    menu: (name, fn) => GM_registerMenuCommand(name, fn),
    unmenu: (id) => GM_unregisterMenuCommand(id),
  };
  const boot = () =>
    start(window, gm).catch((e) => console.error('[BYRBT Tools] 初始化失败：', e.message));
  boot();
  window.addEventListener('pageshow', (event) => {
    if (event.persisted) boot();
  });
}
