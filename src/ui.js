import {
  addUser,
  LAYERS,
  mergeConfig,
  nativeBlacklist,
  parseUserInput,
  currentAccount,
  uidFromHref,
  SITE,
} from './core.js';
import { DraftSession, DraftConflict } from './drafts.js';
import { createShell } from './shell.js';

const NAMES = { interaction: '互动内容', resource: '资源与作品', identity: '其他身份' };

export function mountUI(doc, { store, inactiveReason, onReveal, getReveal, getCount, fetchPage }) {
  const session = store ? new DraftSession(store) : null;
  const make = (tag, text, attrs = {}) => {
    const e = doc.createElement(tag);
    if (text !== undefined) e.textContent = text;
    for (const [key, value] of Object.entries(attrs)) e.setAttribute(key, value);
    return e;
  };
  let container,
    footer,
    tables = new Map(),
    pendingOperation = '',
    currentPage = 'list',
    search = '',
    inputText = '',
    limit = 100,
    statusText = '',
    statusError = false;
  let conflicts = [],
    choices = {},
    busy = false,
    disposed = false,
    leavePromise,
    leaveResolve,
    leavePrompt;
  function status(text, error = false) {
    statusText = text;
    statusError = error;
    const el = shell.host.querySelector('.status');
    if (el) {
      el.textContent = text;
      el.className = `status ${error ? 'error' : ''}`;
      if (error) locate(el);
    }
  }
  async function action(fn) {
    if (disposed || busy) return;
    try {
      await fn();
    } catch (e) {
      if (disposed) return;
      if (e instanceof DraftConflict) {
        conflicts = e.conflicts;
        render();
      }
      status(e.message || '操作失败', true);
      if (e instanceof DraftConflict) locate(shell.feedback.querySelector('select'));
    }
  }
  function button(text, fn, attrs = {}) {
    const e = make('button', text, { type: 'button', ...attrs });
    e.addEventListener('click', () => action(fn));
    return e;
  }
  function locate(el) {
    el?.scrollIntoView?.({ block: 'nearest' });
    el?.focus({ preventScroll: true });
  }
  function discard() {
    session?.reset();
    conflicts = [];
    choices = {};
    inputText = '';
    statusText = '';
    statusError = false;
    pendingOperation = '';
  }
  function canLeave() {
    if (busy) {
      status('正在保存，请稍候');
      return Promise.resolve(false);
    }
    if (!session?.dirty) return Promise.resolve(true);
    if (leavePromise) return leavePromise;
    const previousFocus = doc.activeElement;
    leavePromise = new Promise((resolve) => {
      leaveResolve = resolve;
    });
    leavePrompt = make('div', undefined, {
      'data-leave-prompt': '',
      role: 'alertdialog',
      'aria-label': '未保存修改',
    });
    const finish = (value) => {
      const resolve = leaveResolve;
      leaveResolve = null;
      leavePromise = null;
      leavePrompt?.remove();
      leavePrompt = null;
      if (!value)
        locate(
          previousFocus?.isConnected ? previousFocus : shell.host.querySelector('[data-save]'),
        );
      resolve?.(value);
    };
    const keep = button('继续编辑', () => finish(false));
    leavePrompt.append(
      make('p', '有未保存修改。离开会放弃这些修改。'),
      keep,
      button('放弃修改后离开', () => finish(true)),
    );
    shell.prompts.append(leavePrompt);
    locate(keep);
    return leavePromise;
  }
  const shell = createShell(doc, { canLeave, onLeave: discard });
  function edit(fn) {
    session.edit(fn);
    conflicts = [];
    choices = {};
    statusText = '修改尚未保存';
    statusError = false;
    render();
  }
  function counts() {
    const count = shell.host.querySelector('[data-count]');
    if (count)
      count.textContent = getReveal()
        ? `已临时显示全部内容（规则匹配 ${getCount()} 项，含已加载框架）`
        : `屏蔽已启用（规则匹配 ${getCount()} 项，含已加载框架）`;
    const reveal = shell.host.querySelector('[data-reveal]');
    if (reveal) reveal.textContent = getReveal() ? '恢复屏蔽' : '临时显示本页';
  }
  function section(title, page, target = container) {
    if (!tables.has(target)) tables.set(target, new Map());
    const group = tables.get(target),
      key = page || 'shared';
    if (!group.has(key)) {
      const table = make('table', undefined, {
          class: 'rowtable wide byrbt-section',
          ...(page ? { 'data-page': page } : {}),
        }),
        tbody = make('tbody');
      table.append(tbody);
      target.append(table);
      group.set(key, tbody);
    }
    const row = make('tr'),
      heading = make('td', title, { class: 'rowhead nowrap' }),
      cell = make('td', undefined, { class: 'rowfollow' });
    row.append(heading, cell);
    group.get(key).append(row);
    return cell;
  }
  function showPage(page) {
    currentPage = ['list', 'rules', 'transfer'].includes(page) ? page : 'list';
    if (!container) return;
    container.querySelectorAll('[data-page]').forEach((el) => {
      el.hidden = el.dataset.page !== currentPage;
    });
    container.querySelectorAll('[data-subpage]').forEach((el) => {
      const selected = el.dataset.subpage === currentPage;
      el.parentElement.classList.toggle('selected', selected);
      if (selected) el.setAttribute('aria-current', 'page');
      else el.removeAttribute('aria-current');
    });
  }
  function renderUsers(list) {
    list.replaceChildren();
    const users = Object.values(session.value.users).filter((u) =>
      `${u.uid} ${u.name}`.toLowerCase().includes(search.toLowerCase()),
    );
    if (!users.length) {
      const row = make('tr');
      row.append(make('td', '没有匹配的用户', { class: 'rowfollow muted', colspan: '5' }));
      list.append(row);
      return;
    }
    for (const u of users.slice(0, limit)) {
      const entry = make('tr', undefined, { class: 'entry', 'data-uid': u.uid, tabindex: '-1' });
      const head = make('td', undefined, { class: 'rowfollow byrbt-user' });
      head.append(
        make('a', `${u.name || '用户'} · UID ${u.uid}`, {
          href: `${SITE}/userdetails.php?id=${u.uid}`,
          target: '_blank',
          rel: 'noopener',
        }),
      );
      entry.append(head);
      for (const key of LAYERS) {
        const cell = make('td', undefined, { class: 'rowfollow' }),
          select = make('select', undefined, { 'aria-label': `${u.uid} ${NAMES[key]}` });
        for (const [value, text] of [
          ['inherit', '继承全局'],
          ['on', '屏蔽'],
          ['off', '保留'],
        ])
          select.append(make('option', text, { value }));
        select.value = u.overrides[key] === undefined ? 'inherit' : u.overrides[key] ? 'on' : 'off';
        select.addEventListener('change', () =>
          action(() =>
            edit((c) => {
              if (select.value === 'inherit') delete c.users[u.uid].overrides[key];
              else c.users[u.uid].overrides[key] = select.value === 'on';
            }),
          ),
        );
        cell.append(select);
        entry.append(cell);
      }
      const operation = make('td', undefined, { class: 'rowfollow' });
      operation.append(
        button(
          '取消屏蔽',
          () => {
            pendingOperation = `UID ${u.uid} 的取消屏蔽操作已填入草稿，请保存设置`;
            edit((c) => {
              delete c.users[u.uid];
            });
            locate(shell.host.querySelector('[data-operation]'));
          },
          { 'aria-label': `取消屏蔽 UID ${u.uid}` },
        ),
      );
      entry.append(operation);
      list.append(entry);
    }
    if (users.length > limit) {
      const row = make('tr'),
        cell = make('td', undefined, { class: 'rowfollow', colspan: '5' });
      cell.append(
        button(`再显示 100 项（共 ${users.length} 项）`, () => {
          limit += 100;
          renderUsers(list);
        }),
      );
      row.append(cell);
      list.append(row);
    }
  }
  function conflictLabel(path) {
    const p = path.split('.');
    return p[0] === 'defaults'
      ? `全局 ${NAMES[p[1]]}`
      : `用户 UID ${p[1]}${p[2] ? ` · ${NAMES[p[2]] || '展示名称'}` : ' · 名单记录（加入/删除）'}`;
  }
  function describe(value) {
    if (value === undefined) return '未设置 / 不在名单';
    if (typeof value === 'boolean') return value ? '屏蔽' : '保留';
    if (typeof value === 'object')
      return `在名单中：${value.name || value.uid}，个性规则 ${JSON.stringify(value.overrides)}`;
    return String(value);
  }
  async function save() {
    busy = true;
    render();
    try {
      await session.save(choices);
      if (disposed) return;
      conflicts = [];
      choices = {};
      statusText = '设置已保存，已应用到当前账号';
      statusError = false;
      inputText = '';
      pendingOperation = '';
    } finally {
      busy = false;
      if (!disposed) render();
    }
  }
  function renderFooter() {
    footer.feedback.replaceChildren();
    footer.setActions(
      button(busy ? '正在保存…' : '保存设置', save, { 'data-save': '', 'data-focus': 'save' }),
      button(
        '放弃修改',
        () => {
          discard();
          render();
        },
        { 'data-discard': '', 'data-focus': 'discard' },
      ),
    );
    footer.feedback.append(
      make('strong', session.dirty ? '有未保存修改' : '已保存', { 'data-dirty': '' }),
      make('div', statusText, {
        class: `status ${statusError ? 'error' : ''}`,
        tabindex: '-1',
        role: 'status',
        'aria-live': 'polite',
      }),
    );
    if (conflicts.length) {
      const area = section('解决其他标签页的修改冲突', undefined, footer.feedback);
      for (const conflict of conflicts) {
        const row = make('div', undefined, { class: 'row' }),
          label = make('label', conflictLabel(conflict.path));
        const select = make('select', undefined, { 'aria-label': `冲突 ${conflict.path}` });
        select.append(
          make('option', '请选择保留哪一边', { value: '' }),
          make('option', `保留当前编辑：${describe(conflict.local)}`, { value: 'local' }),
          make('option', `使用其他标签页结果：${describe(conflict.remote)}`, { value: 'remote' }),
        );
        select.value =
          choices[conflict.path]?.token === conflict.token ? choices[conflict.path].side : '';
        select.addEventListener('change', () => {
          choices[conflict.path] = { side: select.value, token: conflict.token };
        });
        label.append(select);
        row.append(label);
        area.append(row);
      }
      area.append(
        make('p', '选择完成后再次点击“保存设置”。保存时会重新检查其他标签页的最新修改。'),
      );
    }
    footer.feedback.append(
      make('p', '保存设置会应用名单、规则、导入导出三个子页的全部草稿。', { class: 'muted' }),
    );
  }
  function render() {
    if (!container || disposed) return;
    const focused = doc.activeElement;
    const focus = focused?.getAttribute('aria-label'),
      focusKey = focused?.dataset?.focus;
    container.replaceChildren();
    tables = new Map();
    if (!session) {
      footer.setActions();
      footer.feedback.replaceChildren();
      container.append(
        make('p', inactiveReason || '尚未确认登录账号，未启用名单。', { class: 'error' }),
      );
      return;
    }
    const config = session.value;
    const pages = make('ul', undefined, { class: 'menu', 'aria-label': '用户屏蔽设置' });
    for (const [id, name] of [
      ['list', '名单'],
      ['rules', '规则'],
      ['transfer', '导入导出'],
    ]) {
      const li = make('li'),
        a = make('a', name, { href: `#byrbt-tools/user-blocking/${id}`, 'data-subpage': id });
      a.addEventListener('click', (e) => {
        e.preventDefault();
        shell.open(`user-blocking/${id}`);
      });
      li.append(a);
      pages.append(li);
    }
    container.append(pages);
    section('当前账号').append(make('span', `UID ${config.accountId} · 配置仅保存在本机`));
    const state = section('原页面状态'),
      stateRow = make('div', undefined, { class: 'row' });
    state.append(stateRow);
    stateRow.append(
      make('span', '', { 'data-count': '' }),
      button(
        '',
        () => {
          onReveal(!getReveal());
          counts();
        },
        { 'data-reveal': '' },
      ),
      make(
        'p',
        '临时显示无需保存。点击底部“返回原页面”或顶部指向原页面的导航查看；刷新或前往其他页面后恢复屏蔽。数量基于已保存配置。',
        {
          class: 'muted',
        },
      ),
    );
    for (const key of LAYERS) {
      const cell = section(NAMES[key], 'rules'),
        label = make('label', '屏蔽此类内容'),
        input = make('input', undefined, { type: 'checkbox', 'aria-label': `全局 ${NAMES[key]}` });
      input.checked = config.defaults[key];
      input.addEventListener('change', () =>
        action(() =>
          edit((c) => {
            c.defaults[key] = input.checked;
          }),
        ),
      );
      label.prepend(input);
      cell.append(label);
    }
    section('规则说明', 'rules').append(
      make('span', '单人规则可覆盖全局设置。未知作者、纯文字引用及已识别的站务内容保留。'),
    );
    const add = section('添加用户', 'list'),
      form = make('form'),
      input = make('textarea', undefined, {
        placeholder: 'UID 或 https://byr.pt/userdetails.php?id=…，每行一个',
        'aria-label': '添加用户 UID 或链接',
      });
    input.value = inputText;
    input.addEventListener('input', () => {
      inputText = input.value;
    });
    form.append(input, make('button', '加入屏蔽草稿', { type: 'submit' }));
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      action(() => {
        const values = input.value
          .split(/[\n,，;；]+/)
          .map((s) => s.trim())
          .filter(Boolean);
        if (!values.length) throw new Error('请输入 UID 或链接');
        const ids = values.map(parseUserInput);
        if (ids.some((id) => !id)) throw new Error('存在无效 UID 或非本站个人页链接，未修改草稿');
        session.edit((c) => {
          for (const id of ids) addUser(c, id);
        });
        inputText = '';
        choices = {};
        conflicts = [];
        statusText = `已将 ${new Set(ids).size} 个 UID 加入草稿，请保存设置`;
        statusError = false;
        render();
      });
    });
    add.append(form);
    const file = make('input', undefined, {
      type: 'file',
      accept: '.json,application/json',
      class: 'file',
      'aria-label': '选择名单 JSON',
    });
    file.addEventListener('change', () =>
      action(async () => {
        const f = file.files[0],
          epoch = session.epoch;
        if (!f) return;
        if (f.size > 2 * 1024 * 1024) throw new Error('配置文件不能超过 2 MiB');
        const raw = JSON.parse(await f.text());
        if (disposed || epoch !== session.epoch || !shell.active) return;
        edit((c) => mergeConfig(c, raw));
        status('已合并到草稿；保存后生效，保留现有用户规则与全局设置');
      }),
    );
    section('站点黑名单', 'transfer').append(
      button('导入站点黑名单', async () => {
        const epoch = session.epoch,
          html = await fetchPage('/friends.php');
        if (disposed || epoch !== session.epoch || !shell.active) return;
        const parsed = new doc.defaultView.DOMParser().parseFromString(html, 'text/html');
        if (currentAccount(parsed) !== store.accountId)
          throw new Error('站点登录账号已变化，请刷新页面后导入');
        const users = nativeBlacklist(parsed);
        edit((c) => {
          for (const u of users) addUser(c, u.uid, u.name);
        });
        status(`已合并 ${users.length} 项到草稿；保存后生效，未更改站点设置`);
      }),
    );
    section('导入配置', 'transfer').append(
      button('导入 JSON', () => file.click()),
      file,
      make('p', '合并到当前草稿，保存后生效；保留已有用户规则。'),
    );
    section('导出配置', 'transfer').append(
      button('导出 JSON', () => {
        const blob = new doc.defaultView.Blob([JSON.stringify(store.read(), null, 2)], {
            type: 'application/json',
          }),
          url = doc.defaultView.URL.createObjectURL(blob);
        const a = make('a', '', {
          href: url,
          download: `byrbt-blocklist-${config.accountId}.json`,
        });
        shell.host.append(a);
        a.click();
        a.remove();
        doc.defaultView.setTimeout(() => doc.defaultView.URL.revokeObjectURL(url), 1000);
      }),
      make('p', '仅导出已保存配置；未保存修改不包含在导出中。', { class: 'muted' }),
    );
    const users = section(`屏蔽名单草稿（${Object.keys(config.users).length}）`, 'list'),
      filter = make('input', undefined, {
        type: 'search',
        placeholder: '搜索 UID 或展示名称',
        'aria-label': '搜索屏蔽名单',
      }),
      list = make('tbody');
    filter.value = search;
    filter.addEventListener('input', () => {
      search = filter.value;
      limit = 100;
      renderUsers(list);
    });
    users.append(filter);
    if (pendingOperation)
      section('待执行操作', 'list').append(
        make('div', pendingOperation, { 'data-operation': '', tabindex: '-1', role: 'status' }),
      );
    const scroll = make('div', undefined, { class: 'byrbt-scroll', 'data-page': 'list' }),
      table = make('table', undefined, {
        class: 'coltable wide byrbt-users',
        'aria-label': '屏蔽名单草稿',
      }),
      head = make('thead'),
      headings = make('tr');
    for (const name of ['用户（名称＋UID）', ...Object.values(NAMES), '操作'])
      headings.append(make('td', name, { class: 'colhead', role: 'columnheader' }));
    head.append(headings);
    table.append(head, list);
    scroll.append(table);
    container.append(scroll);
    renderUsers(list);
    renderFooter();
    shell.refreshTheme();
    counts();
    showPage(currentPage);
    shell.host.querySelectorAll('button,input,textarea,select').forEach((e) => {
      e.disabled = busy;
    });
    if (focusKey)
      shell.host.querySelector(`[data-focus="${focusKey}"]`)?.focus({ preventScroll: true });
    else if (focus)
      [...shell.host.querySelectorAll('[aria-label]')]
        .find((e) => e.getAttribute('aria-label') === focus)
        ?.focus({ preventScroll: true });
  }
  shell.register({
    id: 'user-blocking',
    name: '用户屏蔽',
    route: showPage,
    mount(el, context) {
      container = el;
      footer = context;
      render();
    },
    unmount() {
      container = null;
      session?.invalidate();
    },
  });
  let profile;
  const profileId = uidFromHref(doc.URL);
  if (store && profileId && profileId !== store.accountId) {
    profile = button('', () => toggle(profileId, ''));
    shell.mountProfile(profile);
  }
  async function toggle(uid, name) {
    if (!session || disposed || busy) return;
    const remove = Boolean(store.read().users[uid]);
    shell.open('user-blocking/list');
    search = uid;
    pendingOperation = `UID ${uid} 的${remove ? '取消屏蔽' : '屏蔽'}操作已填入草稿，请保存设置`;
    edit((c) => {
      if (remove) delete c.users[uid];
      else addUser(c, uid, name);
    });
    status(`UID ${uid} 的${remove ? '取消屏蔽' : '屏蔽'}操作已填入草稿，请保存设置`);
    locate(
      remove
        ? shell.host.querySelector('[data-operation]')
        : shell.host.querySelector(`[data-uid="${uid}"]`),
    );
  }
  function refresh() {
    if (disposed) return;
    try {
      if (session && !busy) session.remoteChanged();
      if (profile)
        profile.textContent = store.read().users[profileId]
          ? `取消屏蔽 · ${profileId}`
          : `屏蔽此用户 · ${profileId}`;
      if (shell.active) render();
      counts();
    } catch (e) {
      status(e.message, true);
    }
  }
  const beforeUnload = (e) => {
    if (session?.dirty) {
      e.preventDefault();
      e.returnValue = '';
    }
  };
  doc.defaultView.addEventListener('beforeunload', beforeUnload);
  refresh();
  shell.init();
  return {
    host: shell.host,
    open: () => shell.open(),
    refresh,
    counts,
    toggle,
    showError(message) {
      shell.open();
      status(message, true);
    },
    dispose() {
      disposed = true;
      session?.invalidate();
      leaveResolve?.(false);
      leavePrompt?.remove();
      doc.defaultView.removeEventListener('beforeunload', beforeUnload);
      shell.dispose();
    },
  };
}
export function attachQuickActions(doc, { accountId, getConfig, toggle, reportError }) {
  const controls = new Map();
  const style = doc.createElement('style');
  style.dataset.byrbtUi = 'quick-style';
  // A zero-size inline anchor keeps the control out of text flow. Hover/focus
  // must never add button height or width to an existing username line.
  style.textContent = `
  .byrbt-quick-anchor{display:inline;position:relative;margin:0;padding:0;border:0;font-size:inherit;line-height:inherit}
  .byrbt-quick-anchor>.byrbt-link-action{display:block;opacity:0;pointer-events:none;position:absolute;left:0;bottom:-.15em;z-index:10;width:max-content;max-width:none;height:auto;min-height:0;font:inherit;line-height:1;white-space:nowrap;margin:0;padding:0 3px;cursor:pointer}
  a:hover+.byrbt-quick-anchor>.byrbt-link-action,a:focus+.byrbt-quick-anchor>.byrbt-link-action,.byrbt-quick-anchor:hover>.byrbt-link-action,.byrbt-quick-anchor:focus-within>.byrbt-link-action{opacity:1;pointer-events:auto}
  `;
  (doc.head || doc.documentElement).append(style);
  function handle(event) {
    const a = event.target.closest?.('a[href]');
    if (!a || a.closest('[data-byrbt-ui],#info_block')) return;
    const uid = uidFromHref(a.getAttribute('href'));
    if (!uid || uid === accountId) return;
    if (!controls.has(a)) {
      const b = doc.createElement('button'),
        anchor = doc.createElement('span');
      anchor.dataset.byrbtUi = 'quick-anchor';
      anchor.className = 'byrbt-quick-anchor';
      b.type = 'button';
      b.dataset.byrbtUi = 'quick';
      b.className = 'byrbt-link-action';
      b.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const current = uidFromHref(a.getAttribute('href'));
        if (current)
          toggle(current, a.textContent.trim().replace(/^@/, '')).catch((err) =>
            reportError(err.message),
          );
      });
      anchor.append(b);
      a.after(anchor);
      controls.set(a, b);
    }
    const b = controls.get(a);
    b.textContent = getConfig().users[uid] ? '取消屏蔽' : '屏蔽';
    b.setAttribute('aria-label', `${b.textContent} UID ${uid}`);
  }
  doc.addEventListener('mouseover', handle);
  doc.addEventListener('focusin', handle);
  return {
    refresh() {
      for (const [a, b] of controls) {
        if (!a.isConnected) {
          b.parentElement.remove();
          controls.delete(a);
        } else {
          const uid = uidFromHref(a.getAttribute('href'));
          b.textContent = getConfig().users[uid] ? '取消屏蔽' : '屏蔽';
          b.setAttribute('aria-label', `${b.textContent} UID ${uid}`);
        }
      }
    },
    dispose() {
      doc.removeEventListener('mouseover', handle);
      doc.removeEventListener('focusin', handle);
      for (const b of controls.values()) b.parentElement.remove();
      style.remove();
    },
  };
}
