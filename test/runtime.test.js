import test from 'node:test';
import assert from 'node:assert/strict';
import { start } from '../src/main.js';
import { emptyConfig, addUser } from '../src/core.js';
import {
  ACCOUNT,
  BLOCKED,
  OTHER,
  page,
  chat,
  fun,
  post,
  link,
  memoryGM,
  settle,
} from './helpers.js';
import { Engine } from '../src/engine.js';

function seed(overrides = {}) {
  const config = addUser(emptyConfig(ACCOUNT), BLOCKED);
  Object.assign(config.defaults, overrides);
  return memoryGM({ [`byrbt-tools:v1:account:${ACCOUNT}`]: config });
}
test('实际启动、管理面板、取消与批量添加、显示名不执行 HTML', async () => {
  const dom = page(chat(), '/shoutbox.php'),
    gm = seed();
  let fetched = 0;
  dom.window.fetch = () => {
    fetched++;
    throw new Error('unexpected');
  };
  const runtime = await start(dom.window, gm);
  const doc = dom.window.document;
  const ui = doc.querySelector('[data-byrbt-ui="panel"]');
  assert.ok(doc.querySelector('#chat1').classList.contains('byrbt-hidden'));
  assert.equal(fetched, 0);
  dom.window.document.querySelector('.byrbt-launch').click();
  assert.equal(dom.window.location.hash, '#byrbt-tools/user-blocking');
  ui.querySelector('button[aria-label="取消屏蔽 UID 10001"]').click();
  await settle();
  assert.ok(doc.querySelector('#chat1').classList.contains('byrbt-hidden'));
  ui.querySelector('[data-save]').click();
  await settle();
  assert.ok(!doc.querySelector('#chat1').classList.contains('byrbt-hidden'));
  ui.querySelector('textarea').value = `${BLOCKED}\n${OTHER}`;
  ui.querySelector('form').dispatchEvent(
    new dom.window.Event('submit', { bubbles: true, cancelable: true }),
  );
  await settle();
  ui.querySelector('[data-save]').click();
  await settle();
  assert.ok(doc.querySelector('#chat1').classList.contains('byrbt-hidden'));
  const c = gm.get(`byrbt-tools:v1:account:${ACCOUNT}`);
  c.users[BLOCKED].name = '<img src=x onerror=alert(1)>';
  gm.set(`byrbt-tools:v1:account:${ACCOUNT}`, c);
  assert.equal(ui.querySelectorAll('.entry img').length, 0);
  assert.ok(ui.textContent.includes('<img src=x'));
  runtime.dispose();
  assert.equal(doc.querySelectorAll('[data-byrbt-ui],.byrbt-hidden').length, 0);
  dom.window.close();
});
test('临时显示按页面协调，刷新新启动后恢复屏蔽', async () => {
  const dom = page(fun(), '/fun/funpage.php?id=1');
  const gm = seed();
  let runtime = await start(dom.window, gm);
  let ui = dom.window.document.querySelector('[data-byrbt-ui="panel"]');
  dom.window.document.querySelector('.byrbt-launch').click();
  ui.querySelector('[data-reveal]').click();
  assert.equal(dom.window.document.querySelectorAll('.byrbt-hidden').length, 0);
  runtime.dispose();
  runtime = await start(dom.window, gm);
  assert.ok(dom.window.document.querySelector('#fun1').classList.contains('byrbt-hidden'));
  runtime.dispose();
  dom.window.close();
});
test('未知登录账号不会应用其他账号名单，也不会后台请求', async () => {
  const dom = page(chat());
  dom.window.document.querySelector('#info_block').remove();
  let calls = 0;
  dom.window.fetch = () => {
    calls++;
  };
  const runtime = await start(dom.window, seed());
  assert.equal(calls, 0);
  assert.equal(dom.window.document.querySelectorAll('.byrbt-hidden').length, 0);
  runtime.dispose();
  dom.window.close();
});
test('独立查看页只读取一次主页识别账号，失败保持未启用', async () => {
  const dom = page(fun(), '/fun/funpage.php?id=1');
  dom.window.document.querySelector('#info_block').remove();
  let calls = 0;
  dom.window.fetch = async () => {
    calls++;
    return {
      ok: true,
      url: 'https://byr.pt/index.php',
      text: async () => `<div id="info_block">${link(ACCOUNT)}</div>`,
    };
  };
  const runtime = await start(dom.window, seed());
  assert.equal(calls, 1);
  assert.ok(dom.window.document.querySelector('#fun1').classList.contains('byrbt-hidden'));
  runtime.dispose();
  dom.window.close();
});
test('同账号不同页面实时同步，其他账号不受影响', async () => {
  const a = page(chat()),
    b = page(chat()),
    c = page(chat());
  c.window.document.querySelector('#info_block a').href = '/userdetails.php?id=999';
  const gm = seed();
  const runs = await Promise.all([a, b, c].map((d) => start(d.window, gm)));
  assert.ok(a.window.document.querySelector('#chat1').classList.contains('byrbt-hidden'));
  assert.ok(b.window.document.querySelector('#chat1').classList.contains('byrbt-hidden'));
  assert.ok(!c.window.document.querySelector('#chat1').classList.contains('byrbt-hidden'));
  gm.set(`byrbt-tools:v1:account:${ACCOUNT}`, emptyConfig(ACCOUNT));
  assert.ok(!a.window.document.querySelector('#chat1').classList.contains('byrbt-hidden'));
  assert.ok(!b.window.document.querySelector('#chat1').classList.contains('byrbt-hidden'));
  runs.forEach((r) => r.dispose());
  [a, b, c].forEach((d) => d.window.close());
});
test('主页账号 UID 变化后不沿用旧名单', async () => {
  const dom = page(chat()),
    runtime = await start(dom.window, seed());
  dom.window.document.querySelector('#info_block a').href = '/userdetails.php?id=999';
  await settle();
  assert.equal(dom.window.document.querySelectorAll('.byrbt-hidden').length, 0);
  assert.equal(dom.window.document.querySelectorAll('[data-byrbt-ui="panel"]').length, 1);
  runtime.dispose();
  dom.window.dispatchEvent(new dom.window.Event('pagehide'));
  dom.window.close();
});
test('新增同源 iframe 被接管，移除时释放其引擎', async () => {
  const dom = page('<div id="mount"></div>'),
    runtime = await start(dom.window, seed());
  const iframe = dom.window.document.createElement('iframe');
  iframe.src = 'https://byr.pt/shoutbox.php';
  dom.window.document.querySelector('#mount').append(iframe);
  iframe.contentDocument.open();
  iframe.contentDocument.write(`<!doctype html><html><body>${chat()}</body></html>`);
  iframe.contentDocument.close();
  iframe.dispatchEvent(new dom.window.Event('load'));
  await settle();
  assert.ok(iframe.contentDocument.querySelector('#chat1').classList.contains('byrbt-hidden'));
  const old = iframe.contentDocument;
  iframe.remove();
  await settle();
  assert.equal(old.querySelectorAll('.byrbt-hidden').length, 0);
  runtime.dispose();
  dom.window.close();
});
test('站务首帖身份也豁免；普通管理员发言不会按姓名类豁免', () => {
  const dom = page(
    post(BLOCKED, 'pid11', '站务', '1楼') + chat(),
    '/forums.php?action=viewtopic&topicid=14534',
  );
  const c = addUser(emptyConfig(ACCOUNT), BLOCKED);
  c.defaults.identity = true;
  const engine = new Engine(dom.window.document, { getConfig: () => c });
  assert.equal(dom.window.document.querySelector('#pid11 .byrbt-hidden'), null);
  assert.ok(dom.window.document.querySelector('#chat1').classList.contains('byrbt-hidden'));
  engine.dispose();
  dom.window.close();
});
test('快捷入口按链接的最新 UID 操作，避免内容替换后的旧身份', async () => {
  const dom = page(link(BLOCKED, '姓名特效')),
    gm = memoryGM(),
    runtime = await start(dom.window, gm);
  const a = dom.window.document.querySelector('body > span a');
  a.dispatchEvent(new dom.window.MouseEvent('mouseover', { bubbles: true }));
  a.href = `/userdetails.php?id=${OTHER}`;
  a.nextElementSibling.querySelector('button').click();
  await settle();
  assert.equal(gm.get(`byrbt-tools:v1:account:${ACCOUNT}`), undefined);
  dom.window.document.querySelector('[data-save]').click();
  await settle();
  const c = gm.get(`byrbt-tools:v1:account:${ACCOUNT}`);
  assert.ok(c.users[OTHER]);
  assert.ok(!c.users[BLOCKED]);
  runtime.dispose();
  assert.equal(dom.window.document.querySelector('.byrbt-quick-anchor'), null);
  dom.window.close();
});
test('独立框架账号确认失败时无名单应用且无循环请求', async () => {
  const dom = page(fun(), '/fun/fun.php?id=1');
  dom.window.document.querySelector('#info_block').remove();
  let requests = 0;
  dom.window.fetch = async () => {
    requests++;
    throw new Error('offline');
  };
  const runtime = await start(dom.window, seed());
  await settle();
  assert.equal(requests, 1);
  assert.equal(dom.window.document.querySelectorAll('.byrbt-hidden').length, 0);
  const panel = dom.window.document.querySelector('[data-byrbt-ui="panel"]');
  dom.window.document.querySelector('.byrbt-launch').click();
  assert.match(panel.textContent, /无法确认/);
  runtime.dispose();
  dom.window.close();
});
