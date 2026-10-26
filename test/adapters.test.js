import test from 'node:test';
import assert from 'node:assert/strict';
import { collectUnits, findFunOwner } from '../src/adapters.js';
import { Engine } from '../src/engine.js';
import { addUser, emptyConfig } from '../src/core.js';
import { ACCOUNT, BLOCKED, OTHER, page, link, chat, fun, post, settle } from './helpers.js';

test('站务首帖的局部动态更新不丢失豁免', async () => {
  const s = setup(
    post(
      OTHER,
      'pid11',
      `<fieldset id="official-quote"><legend>${link()}</legend>原文</fieldset>`,
      '1楼',
    ),
    '/forums.php?action=viewtopic&topicid=14534',
  );
  s.doc.querySelector('#official-quote').append('补充');
  await settle();
  assert.ok(!s.doc.querySelector('#official-quote').classList.contains('byrbt-hidden'));
  s.close();
});

function setup(body, path, overrides = {}) {
  const dom = page(body, path);
  const config = addUser(emptyConfig(ACCOUNT), BLOCKED);
  Object.assign(config.defaults, overrides);
  const engine = new Engine(dom.window.document, { getConfig: () => config });
  return {
    dom,
    doc: dom.window.document,
    config,
    engine,
    close() {
      engine.dispose();
      dom.window.close();
    },
  };
}

// Sanitized layout from a real incoming message; no private subject/body is retained.
function inboxDetail(sender = link(), body = `正文引用 ${link(OTHER)}`) {
  return `<table><tr><td class="outer"><nav id="mail-nav">邮箱导航</nav><h1 id="subject">示例主题</h1><table id="mail"><tr id="mail-head"><td class="colhead">自</td><td class="colhead">日期</td></tr><tr id="sender"><td class="rowfollow">${sender}</td><td class="rowfollow">示例日期</td></tr><tr id="message"><td colspan="2"><div class="bbcode-fullwidth">${body}</div></td></tr><tr id="actions"><td>移动邮件</td><td><button>回复</button></td></tr></table></td></tr></table>`;
}

test('真实收件详情布局：按“自”列隐藏主题与正文，保留导航操作并完整恢复', () => {
  const s = setup(inboxDetail(), '/messages.php?action=viewmessage&id=1');
  for (const id of ['subject', 'mail-head', 'sender', 'message'])
    assert.ok(s.doc.getElementById(id).classList.contains('byrbt-hidden'), id);
  for (const id of ['mail-nav', 'mail', 'actions'])
    assert.ok(!s.doc.getElementById(id).classList.contains('byrbt-hidden'), id);
  s.engine.setReveal(true);
  assert.equal(s.doc.querySelectorAll('.byrbt-hidden').length, 0);
  s.engine.setReveal(false);
  assert.ok(s.doc.getElementById('message').classList.contains('byrbt-hidden'));
  s.close();
});

test('系统消息、他人邮件正文中的用户链接不作为发件人', () => {
  for (const sender of ['系统', link(OTHER)]) {
    const s = setup(
      inboxDetail(sender, `正文引用 ${link()}`),
      '/messages.php?action=viewmessage&id=1',
    );
    assert.equal(s.doc.querySelectorAll('.byrbt-hidden').length, 0);
    s.close();
  }
});

test('真实邮件标题与正文之间的邮箱导航表保留，标题仍隐藏', () => {
  const html = inboxDetail().replace(
    '<table id="mail">',
    '<table class="main"><tr><td><div id="pmboxnav">收件箱 / 发件箱</div></td></tr></table><table id="mail">',
  );
  const s = setup(html, '/messages.php?action=viewmessage&id=1');
  assert.ok(s.doc.getElementById('subject').classList.contains('byrbt-hidden'));
  assert.equal(s.doc.getElementById('pmboxnav').closest('.byrbt-hidden'), null);
  s.close();
});

test('邮件正文局部刷新保持归属，发件人变化时撤销屏蔽', async () => {
  const s = setup(inboxDetail(), '/messages.php?action=viewmessage&id=1');
  s.doc.querySelector('.bbcode-fullwidth').append('新增内容');
  await settle();
  assert.ok(s.doc.getElementById('message').classList.contains('byrbt-hidden'));
  s.doc.querySelector('#sender a').href = `/userdetails.php?id=${OTHER}`;
  await settle();
  assert.equal(s.doc.querySelectorAll('.byrbt-hidden').length, 0);
  s.close();
});
test('群聊只按作者识别；提及不隐藏回复者消息', () => {
  const s = setup(
    chat() + chat(OTHER, 'other', `引用文字 ${link(BLOCKED, '@被提及者')}`),
    '/shoutbox.php',
  );
  assert.ok(s.doc.querySelector('#chat1').classList.contains('byrbt-hidden'));
  assert.ok(!s.doc.querySelector('#other').classList.contains('byrbt-hidden'));
  assert.ok(s.doc.querySelector('#other .shoutbox-text a').classList.contains('byrbt-masked'));
  s.close();
});
test('纯文字引用保留，引用正文的其他人链接不是引用作者', () => {
  const content = `<fieldset id="quote"><legend>引用: 未知名字</legend>${link(BLOCKED, '@被提及者')} 他人的话</fieldset>`;
  const s = setup(chat(OTHER, 'other', content), '/shoutbox.php');
  assert.ok(!s.doc.querySelector('#quote').classList.contains('byrbt-hidden'));
  assert.ok(!s.doc.querySelector('#other').classList.contains('byrbt-hidden'));
  s.close();
});
test('明确 UID 的引用只隐藏局部', () => {
  const s = setup(
    chat(
      OTHER,
      'other',
      `<fieldset id="quote"><legend>${link()}</legend>引用内容</fieldset>保留正文`,
    ),
    '/shoutbox.php',
  );
  assert.ok(s.doc.querySelector('#quote').classList.contains('byrbt-hidden'));
  assert.ok(!s.doc.querySelector('#other').classList.contains('byrbt-hidden'));
  s.close();
});
test('趣味盒两份列表均处理，同时保留其他用户', () => {
  const s = setup(
    `<div id="fun-chat-list">${fun()}</div><div id="fun-chat-list-overall">${fun(BLOCKED, 'duplicate')}${fun(OTHER, 'other')}</div>`,
    '/fun/fun.php?id=1',
  );
  assert.equal(s.doc.querySelectorAll('.fun-chat-row.byrbt-hidden').length, 2);
  assert.ok(!s.doc.querySelector('#other').classList.contains('byrbt-hidden'));
  s.close();
});
test('通用评论隐藏头部、头像正文和操作栏；恢复保留事件监听', () => {
  const s = setup(post() + post(OTHER, 'cid112'), '/details.php?id=1');
  const button = s.doc.querySelector('#event-cid111');
  let clicks = 0;
  button.addEventListener('click', () => clicks++);
  assert.ok(s.doc.querySelector('#cid111').parentElement.classList.contains('byrbt-hidden'));
  assert.ok(s.doc.querySelector('#body-cid111').classList.contains('byrbt-hidden'));
  assert.ok(!s.doc.querySelector('#body-cid112').classList.contains('byrbt-hidden'));
  s.engine.setReveal(true);
  button.click();
  assert.equal(clicks, 1);
  assert.equal(s.doc.querySelectorAll('.byrbt-hidden').length, 0);
  s.engine.setReveal(false);
  delete s.config.users[BLOCKED];
  s.engine.refresh();
  button.click();
  assert.equal(clicks, 2);
  assert.equal(s.doc.querySelectorAll('.byrbt-hidden').length, 0);
  s.close();
});
test('论坛逐楼层处理，保留别人回复', () => {
  const s = setup(
    post(BLOCKED, 'pid111', '首帖', '1楼') + post(OTHER, 'pid112', '他人回复', '2楼'),
    '/forums.php?action=viewtopic&topicid=999',
  );
  assert.ok(s.doc.querySelector('#body-pid111').classList.contains('byrbt-hidden'));
  assert.ok(!s.doc.querySelector('#body-pid112').classList.contains('byrbt-hidden'));
  s.close();
});
test('已识别版规主题首帖保留，普通回复仍屏蔽', () => {
  const s = setup(
    post(BLOCKED, 'pid111', '版规', '1楼') + post(BLOCKED, 'pid112', '普通回复', '2楼'),
    '/forums.php?action=viewtopic&topicid=14534',
  );
  assert.ok(!s.doc.querySelector('#body-pid111').classList.contains('byrbt-hidden'));
  assert.ok(s.doc.querySelector('#body-pid112').classList.contains('byrbt-hidden'));
  s.close();
});
test('主题列表最近回复者不改变主题归属', () => {
  const s = setup(
    `<table class="coltable"><tr><td>主题</td><td>作者</td><td>最近回复</td></tr><tr id="topic"><td><a href="?action=viewtopic&topicid=999">标题</a></td><td>${link(OTHER)}</td><td>${link()}</td></tr></table>`,
    '/forums.php?action=viewforum&forumid=9',
    { identity: true },
  );
  assert.ok(!s.doc.querySelector('#topic').classList.contains('byrbt-hidden'));
  assert.ok(s.doc.querySelector('#topic td:last-child span').classList.contains('byrbt-hidden'));
  s.close();
});
for (const [path, label] of [
  ['/torrents.php', '发布者'],
  ['/trial.php', '发布者'],
  ['/subtitles.php', '上传者'],
  ['/viewrequests.php', '求种人'],
])
  test(`${path} 资源层默认关闭，开启才隐藏作者行`, () => {
    const s = setup(
      `<table class="coltable"><tr><td>标题</td><td>${label}</td></tr><tr id="owned"><td>资源</td><td>${link()}</td></tr><tr id="anon"><td>匿名资源</td><td>匿名</td></tr></table>`,
      path,
    );
    assert.ok(!s.doc.querySelector('#owned').classList.contains('byrbt-hidden'));
    s.config.defaults.resource = true;
    s.engine.refresh();
    assert.ok(s.doc.querySelector('#owned').classList.contains('byrbt-hidden'));
    assert.ok(!s.doc.querySelector('#anon').classList.contains('byrbt-hidden'));
    s.close();
  });
test('资源详情隐藏所属内容，保留其他人评论和感谢者', () => {
  const s = setup(
    `<table><tr><td class="rowhead">下载</td><td>${link()} 发布于某日</td></tr><tr id="description"><td class="rowhead">简介</td><td>作品</td></tr><tr id="thanks"><td>感谢者</td><td>${link(OTHER)}</td></tr></table>${post(OTHER)}`,
    '/details.php?id=10',
    { resource: true },
  );
  assert.ok(s.doc.querySelector('#description').classList.contains('byrbt-hidden'));
  assert.ok(!s.doc.querySelector('#thanks').classList.contains('byrbt-hidden'));
  assert.ok(!s.doc.querySelector('#body-cid111').classList.contains('byrbt-hidden'));
  s.close();
});
test('日志按用户链接匹配而非数字子串', () => {
  const s = setup(
    `<table class="coltable"><tr><td>时间</td><td>事件</td></tr><tr id="actual"><td>时间</td><td>用户 示例 (id: ${link(BLOCKED, BLOCKED)}) 发布了资源</td></tr><tr id="unrelated"><td>时间</td><td>种子 210001 删除了</td></tr></table>`,
    '/log.php?query=10001',
    { identity: true },
  );
  assert.ok(s.doc.querySelector('#actual').classList.contains('byrbt-hidden'));
  assert.ok(!s.doc.querySelector('#unrelated').classList.contains('byrbt-hidden'));
  s.close();
});
test('历史页以路由作者为准', () => {
  const s = setup(
    `<table class="coltable"><tr><td>时间</td><td>内容</td></tr><tr id="history"><td>时间</td><td>${link(OTHER)} 引用</td></tr></table>`,
    `/userhistory.php?action=funcomment&id=${BLOCKED}`,
  );
  assert.ok(s.doc.querySelector('#history').classList.contains('byrbt-hidden'));
  s.close();
});
test('种子评论历史包含标题与正文完整隐藏', () => {
  const s = setup(
    `<table class="main"><tr><td>标题<table class="rowtable"><tr><td class="comment"><div class="bbcode-fullwidth">正文 ${link(OTHER)}</div></td></tr></table></td></tr></table>`,
    `/userhistory.php?action=viewcomments&id=${BLOCKED}`,
  );
  assert.ok(s.doc.querySelector('table.main').classList.contains('byrbt-hidden'));
  s.close();
});
test('个人资料隐藏不影响导航', () => {
  const s = setup(
    `<table><tr><td class="outer">资料 ${link()}</td></tr></table>`,
    `/userdetails.php?id=${BLOCKED}`,
    { identity: true },
  );
  assert.ok(s.doc.querySelector('td.outer').classList.contains('byrbt-hidden'));
  assert.ok(!s.doc.querySelector('#info_block').classList.contains('byrbt-hidden'));
  s.close();
});
test('系统信无 UID 保留，普通用户邮件列表按发送者匹配', () => {
  const s = setup(
    `<table class="coltable"><tr><td>主题</td><td>发讯者</td></tr><tr id="personal"><td>普通消息</td><td>${link()}</td></tr><tr id="system"><td>系统通知</td><td>系统</td></tr></table>`,
    '/messages.php',
  );
  assert.ok(s.doc.querySelector('#personal').classList.contains('byrbt-hidden'));
  assert.ok(!s.doc.querySelector('#system').classList.contains('byrbt-hidden'));
  s.close();
});
test('私信详情不依据收件人或正文提及推断发件人', () => {
  const s = setup(
    `<table><tr><td>发讯者</td><td>${link(OTHER)}</td></tr><tr><td>收件人</td><td>${link()}</td></tr><tr id="message"><td>正文</td><td>${link()} 被提及</td></tr></table>`,
    '/messages.php?action=viewmessage&id=1',
  );
  assert.ok(!s.doc.querySelector('#message').classList.contains('byrbt-hidden'));
  s.close();
});
test('没有作者表头的未知布局不扩大隐藏范围', () => {
  const s = setup(`<div id="mixed">未知结构 ${link()} ${link(OTHER)}</div>`, '/unknown.php', {
    identity: true,
  });
  assert.ok(!s.doc.querySelector('#mixed').classList.contains('byrbt-hidden'));
  assert.equal(s.doc.querySelectorAll('#mixed .byrbt-hidden').length, 1);
  s.close();
});
test('明确站务页面全部保留', () => {
  for (const path of ['/rules.php', '/staff.php', '/faq.php', '/friends.php']) {
    const dom = page(link(), path);
    assert.equal(collectUnits(dom.window.document).length, 0);
    dom.window.close();
  }
});
test('趣味盒作者识别排除打赏者', () => {
  const dom = page(
    `<table><tr><td>由 ${link(BLOCKED)} 发布于某日</td></tr><tr><td><iframe src="/fun/fun.php"></iframe></td></tr><tr><td>打赏 ${link(OTHER)}</td></tr></table>`,
  );
  assert.equal(findFunOwner(dom.window.document), BLOCKED);
  dom.window.close();
});
test('动态插入、替换、修改 href 后及时重新过滤', async () => {
  const s = setup('<div id="list"></div>', '/shoutbox.php');
  s.doc.querySelector('#list').insertAdjacentHTML('beforeend', chat());
  await settle();
  assert.ok(s.doc.querySelector('#chat1').classList.contains('byrbt-hidden'));
  s.doc.querySelector('.shoutbox-userinfo a').setAttribute('href', `/userdetails.php?id=${OTHER}`);
  await settle();
  assert.ok(!s.doc.querySelector('#chat1').classList.contains('byrbt-hidden'));
  s.doc.querySelector('#list').innerHTML = chat();
  await settle();
  assert.ok(s.doc.querySelector('#chat1').classList.contains('byrbt-hidden'));
  s.close();
});
test('临时显示期间新内容也显示，恢复后重新过滤', async () => {
  const s = setup('<div id="list"></div>', '/fun/funpage.php?id=1');
  s.engine.setReveal(true);
  s.doc.querySelector('#list').innerHTML = fun();
  await settle();
  assert.ok(!s.doc.querySelector('#fun1').classList.contains('byrbt-hidden'));
  s.engine.setReveal(false);
  assert.ok(s.doc.querySelector('#fun1').classList.contains('byrbt-hidden'));
  s.close();
});
test('被删除的节点释放引用，dispose 清理样式与隐藏效果', async () => {
  const s = setup(fun(), '/fun/fun.php?id=1');
  s.doc.querySelector('#fun1').remove();
  await settle();
  assert.equal(s.engine.units.length, 0);
  assert.equal(s.engine.renderer.effects.size, 0);
  s.close();
});
test('首页最新资源可隐藏；竞价置顶人不被当作资源作者', () => {
  const s = setup(
    `<table id="latest-torrent"><tr><td>标题</td><td>发布者</td></tr><tr id="latest"><td>作品</td><td>${link()}</td></tr></table><table id="sticky-torrent"><tr><td>标题</td><td>置顶人</td></tr><tr id="sticky"><td>他人作品</td><td>${link()}</td></tr></table>`,
    '/index.php',
    { resource: true },
  );
  assert.ok(s.doc.querySelector('#latest').classList.contains('byrbt-hidden'));
  assert.ok(!s.doc.querySelector('#sticky').classList.contains('byrbt-hidden'));
  s.close();
});
test('趣味盒弹窗只继承当前作品作者，作品图片隐藏但其他人评论保留', () => {
  const outer = page(
    `<iframe src="/fun/funpage.php?id=10"></iframe><table class="coltable"><tr><td>标题</td><td>发布者</td></tr><tr><td><a href="?action=view&id=10">作品</a></td><td>${link()}</td></tr><tr><td><a href="?action=view&id=11">其他作品</a></td><td>${link(OTHER)}</td></tr></table>`,
    '/fun.php',
  );
  assert.equal(
    findFunOwner(outer.window.document, 'https://byr.pt/fun/funpage.php?id=10'),
    BLOCKED,
  );
  assert.equal(findFunOwner(outer.window.document, 'https://byr.pt/fun/funpage.php?id=11'), OTHER);
  const inner = page(
    `<div class="funbox-image" id="picture">图片</div>${fun(OTHER, 'other-comment')}`,
    '/fun/funpage.php?id=10',
  );
  const c = addUser(emptyConfig(ACCOUNT), BLOCKED),
    engine = new Engine(inner.window.document, {
      getConfig: () => c,
      getContext: () => ({ funOwner: BLOCKED }),
    });
  assert.ok(inner.window.document.querySelector('#picture').classList.contains('byrbt-hidden'));
  assert.ok(
    !inner.window.document.querySelector('#other-comment').classList.contains('byrbt-hidden'),
  );
  engine.dispose();
  inner.window.close();
  outer.window.close();
});
test('赠送者身份层隐藏单个赠送片段，不隐藏整个打赏列表', () => {
  const s = setup(
    `<div id="gifts"><span class="givebonus-list">${link()}(100)</span><span class="givebonus-list">${link(OTHER)}(200)</span></div>`,
    '/details.php?id=1',
    { identity: true },
  );
  assert.ok(s.doc.querySelector('.givebonus-list').classList.contains('byrbt-hidden'));
  assert.ok(!s.doc.querySelector('#gifts').classList.contains('byrbt-hidden'));
  s.close();
});
test('站点覆盖 className 后重新应用过滤而不丢失站点类', async () => {
  const s = setup(chat(), '/shoutbox.php');
  s.doc.querySelector('#chat1').className = 'shoutrow changed-by-site';
  await settle();
  assert.ok(s.doc.querySelector('#chat1').classList.contains('byrbt-hidden'));
  assert.ok(s.doc.querySelector('#chat1').classList.contains('changed-by-site'));
  s.close();
});
test('作者选择器形状消失时撤销旧屏蔽，不隐藏未知作者节点', async () => {
  const s = setup(fun(), '/fun/fun.php?id=1');
  s.doc.querySelector('.fun-chat-row-name').className = 'unknown-name-shape';
  await settle();
  assert.ok(!s.doc.querySelector('#fun1').classList.contains('byrbt-hidden'));
  s.close();
});
test('用户排行与徽章名单隐藏自己的行，不移除表头和别人', () => {
  for (const path of ['/topten.php', '/badges.php?action=owners&bid=1']) {
    const s = setup(
      `<table class="coltable"><tr><td>序号</td><td>用户名</td></tr><tr id="target"><td>1</td><td>${link()}</td></tr><tr id="other"><td>2</td><td>${link(OTHER)}</td></tr></table>`,
      path,
      { identity: true },
    );
    assert.ok(s.doc.querySelector('#target').classList.contains('byrbt-hidden'));
    assert.ok(!s.doc.querySelector('#other').classList.contains('byrbt-hidden'));
    assert.ok(!s.doc.querySelector('tr').classList.contains('byrbt-hidden'));
    s.close();
  }
});
