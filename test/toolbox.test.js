import test from 'node:test';
import assert from 'node:assert/strict';
import { start } from '../src/main.js';
import { mountUI } from '../src/ui.js';
import { ConfigStore } from '../src/store.js';
import { addUser, emptyConfig } from '../src/core.js';
import { page, chat, link, ACCOUNT, BLOCKED, OTHER, memoryGM, settle } from './helpers.js';

const nav = `<table class="mainouter"><tr><td id="nav_block"><ul class="menu"><li class="selected"><a href="index.php">首页</a></li><li><a href="usercp.php">控制面板</a></li><li><a href="staff.php">管理组</a></li></ul></td></tr><tr id="original"><td class="outer">${chat()}<iframe id="frame"></iframe></td></tr></table><footer id="nexus-footer">页脚</footer>`;
const click = (doc, text) => {
  const b = [...doc.querySelectorAll('[data-byrbt-ui] button')].find((e) => e.textContent === text);
  assert.ok(b, text);
  b.click();
};
const open = (doc) => doc.querySelector('.byrbt-launch').click();
function add(doc, win, text = BLOCKED) {
  doc.querySelector('.byrbt-tools textarea').value = text;
  doc
    .querySelector('.byrbt-tools form')
    .dispatchEvent(new win.Event('submit', { bubbles: true, cancelable: true }));
}
function config(gm) {
  return gm.get(`byrbt-tools:v1:account:${ACCOUNT}`, emptyConfig(ACCOUNT));
}

test('名单、规则和导入导出子页切换及历史保留同一草稿', async () => {
  const dom = page(nav, '/index.php#cid777'),
    doc = dom.window.document;
  const runtime = await start(dom.window, memoryGM());
  open(doc);
  add(doc, dom.window);
  doc.querySelector('[data-subpage="rules"]').click();
  assert.equal(dom.window.location.hash, '#byrbt-tools/user-blocking/rules');
  assert.equal(doc.querySelector('[data-page="rules"]').hidden, false);
  assert.equal(doc.querySelector('[data-page="list"]').hidden, true);
  doc.querySelector('[data-subpage="transfer"]').click();
  dom.window.history.back();
  await settle(30);
  assert.equal(doc.querySelector('[data-subpage="rules"]').getAttribute('aria-current'), 'page');
  assert.equal(doc.querySelector('[data-dirty]').textContent, '有未保存修改');
  assert.equal(doc.querySelector(`[data-uid="${BLOCKED}"]`) !== null, true);
  runtime.dispose();
  dom.window.close();
});

test('工具箱紧邻管理组，原页面及 iframe 不移动，返回恢复 hash/选中状态', async () => {
  const dom = page(nav, '/index.php#cid123'),
    doc = dom.window.document,
    frame = doc.querySelector('#frame'),
    parent = frame.parentElement,
    frameDoc = frame.contentDocument;
  const runtime = await start(dom.window, memoryGM());
  assert.equal(
    doc.querySelector('.byrbt-launch').parentElement.previousElementSibling.textContent,
    '管理组',
  );
  open(doc);
  assert.equal(doc.querySelector('#original').hasAttribute('data-byrbt-suspended'), true);
  assert.equal(frame.parentElement, parent);
  assert.equal(frame.contentDocument, frameDoc);
  assert.equal(doc.querySelector('#nav_block li.selected').textContent, '工具箱');
  click(doc, '返回原页面');
  await settle();
  assert.equal(dom.window.location.hash, '#cid123');
  assert.equal(frame.contentDocument, frameDoc);
  assert.equal(doc.querySelector('#original').hasAttribute('data-byrbt-suspended'), false);
  assert.equal(doc.querySelector('#nav_block li.selected').textContent, '首页');
  runtime.dispose();
  assert.equal(
    doc.querySelectorAll('[data-byrbt-ui],[data-byrbt-suspended],[data-byrbt-navigation]').length,
    0,
  );
  dom.window.close();
});

test('顶部同页导航直接返回，保留临时显示、原 hash 与 iframe（含首页别名）', async () => {
  for (const path of ['/index.php#cid123', '/#cid123', '/index.php']) {
    const dom = page(nav, path),
      doc = dom.window.document,
      initial = addUser(emptyConfig(ACCOUNT), BLOCKED),
      runtime = await start(
        dom.window,
        memoryGM({ [`byrbt-tools:v1:account:${ACCOUNT}`]: initial }),
      ),
      frameDoc = doc.querySelector('#frame').contentDocument;
    assert.ok(doc.querySelector('#chat1').classList.contains('byrbt-hidden'));
    open(doc);
    click(doc, '临时显示本页');
    await settle();
    assert.match(
      doc.querySelector('[data-count]').textContent,
      /已临时显示全部内容.*规则匹配 1 项/,
    );
    doc.querySelector('#nav_block a[href="index.php"]').click();
    await settle();
    assert.equal(dom.window.location.href, `https://byr.pt${path}`);
    assert.equal(doc.querySelector('[data-byrbt-ui="tool-row"]').hidden, true);
    assert.equal(doc.querySelector('#original').hasAttribute('data-byrbt-suspended'), false);
    assert.equal(doc.querySelector('#frame').contentDocument, frameDoc);
    assert.equal(doc.querySelector('#chat1').classList.contains('byrbt-hidden'), false);
    assert.equal(doc.querySelector('#nav_block li.selected').textContent, '首页');
    open(doc);
    assert.match(doc.querySelector('[data-count]').textContent, /已临时显示全部内容/);
    click(doc, '恢复屏蔽');
    await settle();
    assert.ok(doc.querySelector('#chat1').classList.contains('byrbt-hidden'));
    runtime.dispose();
    dom.window.close();
  }
});

test('顶部同页返回遵守草稿离开提醒，放弃后恢复原页面且不保存', async () => {
  const dom = page(nav),
    doc = dom.window.document,
    gm = memoryGM(),
    runtime = await start(dom.window, gm);
  open(doc);
  add(doc, dom.window);
  doc.querySelector('#nav_block a[href="index.php"]').click();
  await settle();
  assert.ok(doc.querySelector('[data-leave-prompt]'));
  click(doc, '继续编辑');
  await settle();
  assert.equal(doc.querySelector('[data-byrbt-ui="tool-row"]').hidden, false);
  assert.ok(doc.querySelector(`[data-uid="${BLOCKED}"]`));
  doc.querySelector('#nav_block a[href="index.php"]').click();
  await settle();
  click(doc, '放弃修改后离开');
  await settle();
  assert.equal(doc.querySelector('[data-byrbt-ui="tool-row"]').hidden, true);
  assert.equal(config(gm).users[BLOCKED], undefined);
  runtime.dispose();
  dom.window.close();
});

test('顶部不同页面或不同查询参数仍正常导航，不误作同页返回', async () => {
  const dom = page(nav, '/index.php?mode=one'),
    doc = dom.window.document,
    runtime = await start(dom.window, memoryGM()),
    navigationErrors = [];
  dom.virtualConsole.removeAllListeners('jsdomError');
  dom.virtualConsole.on('jsdomError', (e) => navigationErrors.push(e.message));
  open(doc);
  doc.querySelector('#nav_block a[href="index.php"]').click();
  await settle();
  assert.ok(navigationErrors.some((text) => text.includes('navigation')));
  assert.equal(doc.querySelector('[data-byrbt-ui="tool-row"]').hidden, false);
  navigationErrors.length = 0;
  doc.querySelector('#nav_block a[href="usercp.php"]').click();
  await settle();
  assert.ok(navigationErrors.some((text) => text.includes('navigation')));
  runtime.dispose();
  dom.window.close();
});

test('草稿离开提醒：继续编辑保留，放弃后离开不写存储', async () => {
  const dom = page(nav),
    doc = dom.window.document,
    gm = memoryGM(),
    runtime = await start(dom.window, gm);
  open(doc);
  add(doc, dom.window);
  await settle();
  click(doc, '返回原页面');
  await settle();
  assert.ok(doc.querySelector('[data-leave-prompt]'));
  click(doc, '继续编辑');
  await settle();
  assert.ok(doc.querySelector('[data-dirty]').textContent.includes('未保存'));
  const event = new dom.window.Event('beforeunload', { cancelable: true });
  dom.window.dispatchEvent(event);
  assert.equal(event.defaultPrevented, true);
  click(doc, '返回原页面');
  await settle();
  click(doc, '放弃修改后离开');
  await settle();
  assert.equal(config(gm).users[BLOCKED], undefined);
  assert.equal(doc.querySelector('[data-byrbt-ui="tool-row"]').hidden, true);
  open(doc);
  assert.equal(doc.querySelectorAll('.entry').length, 0);
  runtime.dispose();
  dom.window.close();
});

test('远端更新不能覆盖编辑草稿，保存合并后两边用户都在', async () => {
  const dom = page(nav),
    doc = dom.window.document,
    gm = memoryGM(),
    runtime = await start(dom.window, gm);
  open(doc);
  add(doc, dom.window);
  await settle();
  gm.set(`byrbt-tools:v1:account:${ACCOUNT}`, addUser(emptyConfig(ACCOUNT), OTHER));
  assert.ok(doc.querySelector(`[data-uid="${BLOCKED}"]`));
  assert.equal(doc.querySelector(`[data-uid="${OTHER}"]`), null);
  click(doc, '保存设置');
  await settle();
  assert.ok(config(gm).users[BLOCKED]);
  assert.ok(config(gm).users[OTHER]);
  runtime.dispose();
  dom.window.close();
});

test('UI 冲突选择保存不覆盖新远端变化，冲突再次提示', async () => {
  const dom = page(nav),
    doc = dom.window.document,
    initial = addUser(emptyConfig(ACCOUNT), BLOCKED),
    gm = memoryGM({ [`byrbt-tools:v1:account:${ACCOUNT}`]: initial }),
    runtime = await start(dom.window, gm);
  open(doc);
  doc.querySelector(`[aria-label="取消屏蔽 UID ${BLOCKED}"]`).click();
  await settle();
  const remote = structuredClone(initial);
  remote.users[BLOCKED].name = '修改一';
  gm.set(`byrbt-tools:v1:account:${ACCOUNT}`, remote);
  click(doc, '保存设置');
  await settle();
  let select = doc.querySelector('[aria-label^="冲突"]');
  assert.ok(select);
  assert.equal(doc.activeElement, select);
  assert.ok(select.closest('.byrbt-footer'));
  select.value = 'local';
  select.dispatchEvent(new dom.window.Event('change'));
  remote.users[BLOCKED].name = '修改二';
  gm.set(`byrbt-tools:v1:account:${ACCOUNT}`, remote);
  click(doc, '保存设置');
  await settle();
  assert.equal(config(gm).users[BLOCKED].name, '修改二');
  select = doc.querySelector('[aria-label^="冲突"]');
  assert.equal(select.value, '');
  select.value = 'remote';
  select.dispatchEvent(new dom.window.Event('change'));
  click(doc, '保存设置');
  await settle();
  assert.equal(config(gm).users[BLOCKED].name, '修改二');
  assert.equal(doc.querySelector('[data-dirty]').textContent, '已保存');
  runtime.dispose();
  dom.window.close();
});

test('原生双列表格、五列名单与唯一底部操作区', async () => {
  const dom = page(nav),
    doc = dom.window.document,
    runtime = await start(dom.window, memoryGM());
  open(doc);
  assert.equal(
    doc.querySelectorAll('.byrbt-tools h1,.byrbt-tools h2,.byrbt-tools table.main').length,
    0,
  );
  assert.equal(doc.querySelector('.byrbt-users thead tr').cells.length, 5);
  assert.equal(doc.querySelector('.byrbt-users tbody td').colSpan, 5);
  assert.deepEqual(
    [...doc.querySelectorAll('.byrbt-actions button')].map((e) => e.textContent),
    ['保存设置', '放弃修改', '返回原页面'],
  );
  assert.equal(doc.querySelectorAll('[data-save],[data-discard],[data-return]').length, 3);
  assert.equal(doc.querySelector('.byrbt-tools').lastElementChild.className, 'byrbt-footer');
  assert.equal(doc.querySelector('.byrbt-footer').closest('.byrbt-scroll'), null);
  add(doc, dom.window);
  assert.equal(doc.querySelector('.entry').cells.length, 5);
  doc.querySelector('[data-subpage="rules"]').click();
  assert.equal(doc.querySelector('[data-page="rules"]').rows.length, 4);
  assert.ok(
    [...doc.querySelectorAll('.byrbt-section tr')].every(
      (r) =>
        r.cells.length === 2 &&
        r.cells[0].matches('.rowhead.nowrap') &&
        r.cells[1].matches('.rowfollow'),
    ),
  );
  click(doc, '保存设置');
  await settle();
  assert.equal(doc.querySelector('[data-return]').disabled, false);
  runtime.dispose();
  dom.window.close();
});

test('长名单加载和搜索保持五列边界，修改单人规则保留焦点', async () => {
  const initial = emptyConfig(ACCOUNT);
  for (let id = 500000; id < 500101; id++) addUser(initial, String(id), '长名称'.repeat(30));
  const dom = page(nav),
    doc = dom.window.document,
    runtime = await start(dom.window, memoryGM({ [`byrbt-tools:v1:account:${ACCOUNT}`]: initial }));
  open(doc);
  assert.equal(doc.querySelectorAll('.entry').length, 100);
  click(doc, '再显示 100 项（共 101 项）');
  assert.equal(doc.querySelectorAll('.entry').length, 101);
  let select = doc.querySelector('[aria-label="500100 互动内容"]');
  select.focus();
  select.value = 'off';
  select.dispatchEvent(new dom.window.Event('change'));
  await settle();
  assert.equal(doc.activeElement.getAttribute('aria-label'), '500100 互动内容');
  const search = doc.querySelector('[aria-label="搜索屏蔽名单"]');
  search.value = '无匹配';
  search.dispatchEvent(new dom.window.Event('input'));
  assert.equal(doc.querySelector('.byrbt-users tbody td').colSpan, 5);
  runtime.dispose();
  dom.window.close();
});

test('快捷入口定位用户行或待执行操作，离开提醒位于底部并恢复焦点', async () => {
  const dom = page(nav),
    doc = dom.window.document,
    gm = memoryGM(),
    store = new ConfigStore(ACCOUNT, gm);
  const ui = mountUI(doc, {
    store,
    getCount: () => 0,
    getReveal: () => false,
    onReveal: () => {},
    fetchPage: async () => '',
  });
  await ui.toggle(BLOCKED, '测试');
  assert.equal(doc.activeElement.dataset.uid, BLOCKED);
  const back = doc.querySelector('[data-return]');
  back.focus();
  back.click();
  await settle();
  assert.ok(doc.querySelector('[data-leave-prompt]').closest('.byrbt-footer'));
  click(doc, '继续编辑');
  await settle();
  assert.equal(doc.activeElement, back);
  click(doc, '保存设置');
  await settle();
  await ui.toggle(BLOCKED, '测试');
  assert.equal(doc.activeElement.hasAttribute('data-operation'), true);
  assert.ok(doc.activeElement.textContent.includes('取消屏蔽'));
  assert.ok(store.read().users[BLOCKED]);
  ui.dispose();
  store.dispose();
  dom.window.close();
});

test('保存失败保留草稿，错误获得焦点且返回按钮重新启用', async () => {
  const dom = page(nav),
    doc = dom.window.document,
    gm = memoryGM(),
    runtime = await start(dom.window, gm);
  open(doc);
  add(doc, dom.window);
  gm.set = () => {
    throw new Error('测试存储失败');
  };
  click(doc, '保存设置');
  await settle();
  assert.ok(doc.activeElement.matches('.status.error'));
  assert.ok(doc.activeElement.closest('.byrbt-footer'));
  assert.equal(doc.querySelector('[data-dirty]').textContent, '有未保存修改');
  assert.equal(doc.querySelector('[data-return]').disabled, false);
  runtime.dispose();
  dom.window.close();
});

test('异步黑名单导入在放弃草稿后不能落入新会话', async () => {
  const dom = page(nav),
    doc = dom.window.document,
    gm = memoryGM(),
    store = new ConfigStore(ACCOUNT, gm);
  let finish;
  const ui = mountUI(doc, {
    store,
    getCount: () => 0,
    getReveal: () => false,
    onReveal: () => {},
    fetchPage: () =>
      new Promise((r) => {
        finish = r;
      }),
  });
  ui.open();
  click(doc, '导入站点黑名单');
  click(doc, '放弃修改');
  finish(
    `<div id="info_block">${link(ACCOUNT)}</div><table><tr><td>${link()}<a href="friends.php?action=delete&type=block&targetid=${BLOCKED}">删除</a></td></tr></table>`,
  );
  await settle();
  assert.equal(doc.querySelectorAll('.entry').length, 0);
  assert.equal(config(gm).users[BLOCKED], undefined);
  ui.dispose();
  store.dispose();
  dom.window.close();
});

test('JSON 导入先进入草稿，导出仅包含已保存配置', async () => {
  const dom = page(nav),
    doc = dom.window.document,
    gm = memoryGM(),
    runtime = await start(dom.window, gm);
  open(doc);
  let exported;
  dom.window.Blob = class {
    constructor(parts) {
      exported = JSON.parse(parts[0]);
    }
  };
  dom.window.URL.createObjectURL = () => 'blob:test';
  dom.window.URL.revokeObjectURL = () => {};
  doc.addEventListener(
    'click',
    (e) => {
      if (e.target.download) e.preventDefault();
    },
    true,
  );
  const file = doc.querySelector('input[type=file]');
  Object.defineProperty(file, 'files', {
    value: [
      { size: 100, text: async () => JSON.stringify(addUser(emptyConfig(ACCOUNT), BLOCKED)) },
    ],
  });
  file.dispatchEvent(new dom.window.Event('change'));
  await settle();
  assert.ok(doc.querySelector(`[data-uid="${BLOCKED}"]`));
  assert.equal(config(gm).users[BLOCKED], undefined);
  click(doc, '导出 JSON');
  assert.equal(exported.users[BLOCKED], undefined);
  click(doc, '保存设置');
  await settle();
  click(doc, '导出 JSON');
  assert.ok(exported.users[BLOCKED]);
  runtime.dispose();
  dom.window.close();
});

test('已屏蔽个人页的内嵌取消入口不在隐藏区域，动作只写草稿', async () => {
  const dom = page(nav, `/userdetails.php?id=${BLOCKED}`),
    doc = dom.window.document,
    c = addUser(emptyConfig(ACCOUNT), BLOCKED);
  c.defaults.identity = true;
  const gm = memoryGM({ [`byrbt-tools:v1:account:${ACCOUNT}`]: c }),
    runtime = await start(dom.window, gm);
  const button = doc.querySelector('[data-byrbt-ui="profile"] button');
  assert.ok(button);
  assert.equal(button.closest('.byrbt-hidden'), null);
  button.click();
  await settle();
  assert.ok(config(gm).users[BLOCKED]);
  assert.equal(doc.querySelectorAll('.entry').length, 0);
  runtime.dispose();
  dom.window.close();
});

test('直接工具 hash 启动及浏览器后退前进，不重复挂载', async () => {
  const dom = page(nav, '/index.php#byrbt-tools/user-blocking'),
    doc = dom.window.document,
    runtime = await start(dom.window, memoryGM());
  assert.ok(doc.querySelector('[data-save]'));
  click(doc, '返回原页面');
  await settle();
  assert.equal(dom.window.location.hash, '');
  open(doc);
  dom.window.history.back();
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(doc.querySelector('[data-byrbt-ui="tool-row"]').hidden, true);
  dom.window.history.forward();
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(doc.querySelector('[data-byrbt-ui="tool-row"]').hidden, false);
  assert.equal(doc.querySelectorAll('.byrbt-launch').length, 1);
  runtime.dispose();
  dom.window.close();
});
