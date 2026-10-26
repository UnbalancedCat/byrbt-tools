export const TOOL_HASH = '#byrbt-tools/';

// Feature views share a site-native shell, while their state belongs to the feature.
export function createShell(doc, { canLeave, onLeave }) {
  const win = doc.defaultView,
    registry = new Map(),
    nodes = [];
  const make = (tag, text, cls) => {
    const e = doc.createElement(tag);
    if (text) e.textContent = text;
    if (cls) e.className = cls;
    return e;
  };
  const style = make('style');
  style.dataset.byrbtUi = 'shell-style';
  style.textContent = `
  [data-byrbt-suspended], [data-byrbt-ui][hidden],.byrbt-tools [hidden]{display:none!important}
  ul.menu[data-byrbt-navigation]{white-space:normal}
  ul.menu[data-byrbt-navigation]>li{white-space:nowrap;display:inline-block}
  .byrbt-tools{width:100%;text-align:left;box-sizing:border-box}
  .byrbt-tools *, .byrbt-tools *::before{box-sizing:border-box}
  .byrbt-tools .menu{padding:0;margin:0;white-space:normal}
  .byrbt-tools>.menu{margin:4px 0}
  .byrbt-tools{padding:5px 0;overflow-wrap:anywhere}
  .byrbt-tools table.wide{width:97%;margin:0 auto;border-collapse:collapse}
  .byrbt-tools table.rowtable>tbody>tr>td,.byrbt-tools table.coltable>tbody>tr>td{padding:5px}
  .byrbt-tools .rowhead{width:12em;min-width:12em;white-space:nowrap;vertical-align:top}
  .byrbt-tools table.coltable>thead>tr>td{padding:5px;text-align:center}
  .byrbt-tools.byrbt-grid-fallback table.wide>tbody>tr>td,
  .byrbt-tools.byrbt-grid-fallback table.wide>thead>tr>td{border:1px solid color-mix(in srgb,currentColor 25%,transparent)}
  .byrbt-tools p{margin:.3em 0}
  .byrbt-tools .row{display:flex;align-items:center;gap:.6em;flex-wrap:wrap;margin:0}
  .byrbt-tools label{display:inline-flex;align-items:center;gap:.35em}
  .byrbt-tools button,.byrbt-tools input,.byrbt-tools select,.byrbt-tools textarea{font:inherit;max-width:100%}
  .byrbt-tools button{cursor:pointer}.byrbt-tools textarea,.byrbt-tools input[type=search]{width:100%;padding:.45em}
  .byrbt-tools textarea{height:3.6em;min-height:2.4em;resize:vertical}.byrbt-tools .file{display:none}
  .byrbt-tools .muted{opacity:.8}.byrbt-tools .status{white-space:pre-wrap}
  .byrbt-tools .status:empty{display:none}
  .byrbt-tools .error{font-weight:bold}.byrbt-tools .error::before{content:'⚠ '}
  .byrbt-tools :focus-visible,.byrbt-entry :focus-visible{outline:2px solid currentColor;outline-offset:3px}
  .byrbt-tools .byrbt-scroll{width:97%;margin:0 auto;overflow-x:auto;contain:inline-size}
  .byrbt-tools .byrbt-scroll table{width:100%;min-width:43em}
  .byrbt-tools table.coltable td.byrbt-user{text-align:left;min-width:10em;max-width:24em;overflow-wrap:anywhere}
  .byrbt-tools .colhead{white-space:nowrap}
  .byrbt-tools .byrbt-actions{display:flex;justify-content:center;gap:.7em;flex-wrap:wrap}
  .byrbt-tools .byrbt-feedback,.byrbt-tools .byrbt-prompts{width:97%;margin:0 auto}
  .byrbt-tools .byrbt-feedback table.wide{width:100%;table-layout:fixed}
  .byrbt-tools .byrbt-feedback .rowhead{white-space:normal}
  .byrbt-tools .byrbt-feedback .row{width:100%;min-width:0}
  .byrbt-tools .byrbt-feedback label,.byrbt-tools .byrbt-feedback select{display:block;width:100%;min-width:0}
  .byrbt-tools .byrbt-footer{text-align:center;margin-top:5px}
  .byrbt-entry{padding:.5em;text-align:center}.byrbt-tools [data-leave-prompt]{border:2px solid currentColor;padding:5px}
  `;
  (doc.head || doc.documentElement).append(style);
  nodes.push(style);
  const host = make('div', '', 'byrbt-tools');
  host.dataset.byrbtUi = 'panel';
  function refreshTheme() {
    host.classList.remove('byrbt-grid-fallback');
    const cell = host.querySelector('.byrbt-section td');
    if (cell && win.getComputedStyle(cell).borderTopStyle === 'none')
      host.classList.add('byrbt-grid-fallback');
  }
  const themeLoaded = (e) => {
    if (e.target.matches?.('link[rel="stylesheet"]')) refreshTheme();
  };
  doc.addEventListener('load', themeLoaded, true);
  const original = doc.querySelector('td.outer');
  const originalRow = original?.closest('tr');
  let mount = host;
  if (originalRow) {
    mount = make('tr');
    mount.dataset.byrbtUi = 'tool-row';
    const cell = make('td', '', 'outer');
    cell.colSpan = [...originalRow.cells].reduce((n, c) => n + c.colSpan, 0);
    cell.append(host);
    mount.append(cell);
    originalRow.after(mount);
  } else doc.body.append(host);
  mount.hidden = true;
  nodes.push(mount);
  const menu = doc.querySelector('#nav_block ul.menu,.nav_block ul.menu');
  const menuMarker = menu?.getAttribute('data-byrbt-navigation');
  menu?.setAttribute('data-byrbt-navigation', '');
  const launch = make('a', '工具箱');
  launch.href = `${TOOL_HASH}user-blocking`;
  launch.className = 'byrbt-launch';
  const entry = make(menu ? 'li' : 'div', '', menu ? '' : 'byrbt-entry');
  entry.dataset.byrbtUi = 'entry';
  entry.append(launch);
  if (menu) {
    const staff = [...menu.querySelectorAll('a[href]')].find(
      (a) => new URL(a.href, doc.URL).pathname === '/staff.php',
    );
    if (staff?.parentElement?.parentElement === menu) staff.parentElement.after(entry);
    else menu.append(entry);
  } else doc.body.prepend(entry);
  nodes.push(entry);
  const tabs = make('ul', '', 'menu'),
    content = make('div'),
    footer = make('div', '', 'byrbt-footer'),
    feedback = make('div', '', 'byrbt-feedback'),
    prompts = make('div', '', 'byrbt-prompts'),
    actionTable = make('table', '', 'rowtable wide'),
    actionBody = make('tbody'),
    actionRow = make('tr'),
    actionCell = make('td', '', 'rowfollow'),
    actions = make('div', '', 'byrbt-actions');
  const back = make('button', '返回原页面');
  back.type = 'button';
  back.dataset.return = '';
  actions.append(back);
  actionCell.append(actions);
  actionRow.append(actionCell);
  actionBody.append(actionRow);
  actionTable.append(actionBody);
  footer.append(prompts, feedback, actionTable);
  host.append(tabs, content, footer);
  let active = false,
    feature,
    originUrl,
    originState,
    scroll,
    suspended = [],
    selected = [],
    disposed = false,
    activeRoute = 'user-blocking',
    handling = false;
  function setSuspended() {
    const targets = originalRow
      ? [originalRow]
      : [...doc.body.children].filter(
          (e) => !e.matches('[data-byrbt-ui],script,style,#info_block,#nexus-footer'),
        );
    suspended = targets.map((e) => [e, e.getAttribute('data-byrbt-suspended')]);
    for (const [e] of suspended) e.setAttribute('data-byrbt-suspended', '');
  }
  function activate(id) {
    activeRoute = id;
    const [featureId, page] = id.split('/');
    const next = registry.get(featureId) || registry.values().next().value;
    if (!next) return;
    if (!active) {
      scroll = [win.scrollX, win.scrollY];
      selected = menu
        ? [...menu.children].filter((e) => e !== entry && e.classList.contains('selected'))
        : [];
      selected.forEach((e) => e.classList.remove('selected'));
      entry.classList.add('selected');
      setSuspended();
      active = true;
      mount.hidden = false;
      if (win.scrollX || win.scrollY) win.scrollTo(0, 0);
    }
    if (feature !== next) {
      feature?.unmount?.();
      feature = next;
      content.replaceChildren();
      feedback.replaceChildren();
      actions.replaceChildren(back);
      feature.mount(content, {
        feedback,
        prompts,
        setActions: (...items) => actions.replaceChildren(...items, back),
        requestClose: close,
      });
    }
    feature.route?.(page || 'list');
    [...tabs.children].forEach((li) =>
      li.classList.toggle('selected', li.dataset.feature === feature.id),
    );
  }
  function deactivate() {
    feature?.unmount?.();
    feature = undefined;
    for (const [e, value] of suspended) {
      if (value === null) e.removeAttribute('data-byrbt-suspended');
      else e.setAttribute('data-byrbt-suspended', value);
    }
    suspended = [];
    entry.classList.remove('selected');
    selected.forEach((e) => e.classList.add('selected'));
    active = false;
    mount.hidden = true;
    content.replaceChildren();
    feedback.replaceChildren();
    actions.replaceChildren(back);
    if (scroll && (win.scrollX !== scroll[0] || win.scrollY !== scroll[1])) win.scrollTo(...scroll);
  }
  function open(id = 'user-blocking') {
    if (disposed) return;
    if (!active) {
      originUrl = win.location.href;
      originState = win.history.state;
      if (win.location.hash.startsWith(TOOL_HASH))
        originUrl = win.history.state?.byrbtTools?.originUrl || originUrl.split('#')[0];
      else
        win.history.pushState({ byrbtTools: { originUrl, originState } }, '', `${TOOL_HASH}${id}`);
    } else if (win.location.hash !== `${TOOL_HASH}${id}`)
      win.history.pushState({ byrbtTools: { originUrl, originState } }, '', `${TOOL_HASH}${id}`);
    activate(id);
  }
  async function close() {
    if (!active || !(await canLeave())) return;
    onLeave();
    win.history.replaceState(originState ?? null, '', originUrl || win.location.href.split('#')[0]);
    deactivate();
    launch.focus({ preventScroll: true });
  }
  async function route() {
    if (disposed || handling) return;
    const id = win.location.hash.startsWith(TOOL_HASH)
      ? win.location.hash.slice(TOOL_HASH.length)
      : null;
    if (id) {
      if (!active) {
        originUrl = win.history.state?.byrbtTools?.originUrl || win.location.href.split('#')[0];
        originState = win.history.state?.byrbtTools?.originState;
      }
      activate(id);
      return;
    }
    if (active) {
      handling = true;
      const allowed = await canLeave();
      if (!disposed) {
        if (allowed) {
          onLeave();
          deactivate();
        } else
          win.history.pushState(
            { byrbtTools: { originUrl, originState } },
            '',
            `${TOOL_HASH}${activeRoute}`,
          );
      }
      handling = false;
    }
  }
  async function navigate(event) {
    if (
      !active ||
      event.defaultPrevented ||
      event.button !== 0 ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey ||
      event.altKey
    )
      return;
    const a = event.target.closest?.('a[href]');
    if (!a || a.closest('[data-byrbt-ui]') || a.target === '_blank' || a.hasAttribute('download'))
      return;
    const url = new URL(a.href, doc.URL);
    if (!['https:', 'http:'].includes(url.protocol)) return;
    event.preventDefault();
    event.stopPropagation();
    // Returning through the site's current-page navigation must not reload the
    // suspended document: its frames and temporary reveal state still belong to it.
    const origin = new URL(originUrl || doc.URL),
      pathname = (u) => (u.pathname === '/' ? '/index.php' : u.pathname),
      query = (u) => {
        const params = new URLSearchParams(u.search);
        params.sort();
        return params.toString();
      };
    if (
      menu?.contains(a) &&
      url.origin === origin.origin &&
      pathname(url) === pathname(origin) &&
      query(url) === query(origin) &&
      (!url.hash || url.hash === origin.hash)
    ) {
      await close();
      return;
    }
    if (await canLeave()) {
      onLeave();
      win.location.assign(url.href);
    }
  }
  launch.addEventListener('click', (e) => {
    e.preventDefault();
    open();
  });
  back.addEventListener('click', close);
  win.addEventListener('popstate', route);
  win.addEventListener('hashchange', route);
  doc.addEventListener('click', navigate, true);
  return {
    host,
    content,
    feedback,
    prompts,
    refreshTheme,
    launch,
    get active() {
      return active;
    },
    open,
    close,
    register(view) {
      if (registry.has(view.id)) throw new Error('重复功能标识');
      registry.set(view.id, view);
      const li = make('li');
      li.dataset.feature = view.id;
      const a = make('a', view.name);
      a.href = `${TOOL_HASH}${view.id}`;
      a.addEventListener('click', (e) => {
        e.preventDefault();
        open(view.id);
      });
      li.append(a);
      tabs.append(li);
    },
    init: route,
    mountProfile(button) {
      const bar = make(originalRow ? 'tr' : 'div', '', 'byrbt-entry');
      bar.dataset.byrbtUi = 'profile';
      if (originalRow) {
        const td = make('td');
        td.colSpan = [...originalRow.cells].reduce((n, c) => n + c.colSpan, 0);
        td.append(button);
        bar.append(td);
        originalRow.before(bar);
      } else {
        bar.append(button);
        entry.after(bar);
      }
      nodes.push(bar);
    },
    dispose() {
      disposed = true;
      if (active) deactivate();
      if (menu) {
        if (menuMarker === null) menu.removeAttribute('data-byrbt-navigation');
        else menu.setAttribute('data-byrbt-navigation', menuMarker);
      }
      win.removeEventListener('popstate', route);
      win.removeEventListener('hashchange', route);
      doc.removeEventListener('click', navigate, true);
      doc.removeEventListener('load', themeLoaded, true);
      nodes.forEach((n) => n.remove());
    },
  };
}
