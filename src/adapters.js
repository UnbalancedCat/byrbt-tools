import { normalizeUid, uidFromHref } from './core.js';

const CONTENT = '.bbcode-fullwidth,.bbcode-notfullwidth,.shoutbox-text,.fun-chat-row-content';
const IGNORED = '#info_block,#nav_block,.nav_block,[data-byrbt-ui]';
const PROTECTED_ROUTES = new Set([
  '/rules.php',
  '/faq.php',
  '/staff.php',
  '/contactstaff.php',
  '/usercp.php',
  '/friends.php',
  '/login',
  '/login.php',
]);
// Observed site-maintained rules/tutorial topics, not a keyword guess about ordinary titles.
const OFFICIAL_TOPICS = new Set(['14534', '14536']);
const clean = (s) => (s || '').replace(/\s+/g, '');

export function select(scope, selector) {
  const found = new Set(scope.querySelectorAll(selector));
  if (scope.nodeType === 1) {
    if (scope.matches(selector)) found.add(scope);
    const parent = scope.parentElement?.closest(selector);
    if (parent) found.add(parent);
  }
  return [...found];
}

function authorLink(node) {
  return (
    node &&
    [...node.querySelectorAll('a[href]')].find(
      (a) => !a.closest(CONTENT) && uidFromHref(a.getAttribute('href')),
    )
  );
}
function user(a) {
  return a && uidFromHref(a.getAttribute('href'));
}
function ownedRows(table) {
  return [...table.rows];
}
function rowLabel(row) {
  return clean(row.cells[0]?.textContent);
}
function officialTopic(doc, url) {
  return (
    OFFICIAL_TOPICS.has(url.searchParams.get('topicid')) ||
    [...doc.querySelectorAll('h1 a[href],h2 a[href]')].some((a) => {
      const u = new URL(a.getAttribute('href'), url);
      return (
        u.pathname === '/forums.php' &&
        u.searchParams.get('action') === 'viewforum' &&
        u.searchParams.get('forumid') === '2'
      );
    })
  );
}

export function findFunOwner(doc, frameSrc = '') {
  // Author precedes the iframe; donor lists are not ownership evidence.
  if (!doc.querySelector('iframe[src*="/fun/fun"]')) return null;
  for (const a of doc.querySelectorAll('a[href*="userdetails.php"]')) {
    if (a.closest(IGNORED)) continue;
    const span = a.closest('span.nowrap') || a;
    if (
      /由\s*$/.test(span.previousSibling?.textContent || '') &&
      /发布于/.test(span.nextSibling?.textContent || '')
    )
      return user(a);
  }
  // List popup: use the visible item's author column, not a neighboring work or donor.
  let funId;
  try {
    funId = new URL(frameSrc, doc.URL).searchParams.get('id');
  } catch {
    return null;
  }
  if (funId)
    for (const table of doc.querySelectorAll('table.coltable')) {
      const rows = [...table.rows],
        column = rows[0] && [...rows[0].cells].findIndex((c) => clean(c.textContent) === '发布者');
      if (column === undefined || column < 0) continue;
      for (const row of rows.slice(1)) {
        const matches = [...row.querySelectorAll('a[href]')].some((a) => {
          const u = new URL(a.getAttribute('href'), doc.URL);
          return (
            u.pathname === '/fun.php' &&
            u.searchParams.get('action') === 'view' &&
            u.searchParams.get('id') === funId
          );
        });
        if (matches) return user(authorLink(row.cells[column]));
      }
    }
  return null;
}

export function collectUnits(doc, scope = doc, context = {}) {
  const url = new URL(doc.URL);
  const path = url.pathname;
  if (PROTECTED_ROUTES.has(path)) return [];
  const units = [];
  const add = (key, anchor, uid, layer, targets = [anchor], extra = {}) => {
    if (!uid || !anchor || anchor.closest?.(IGNORED)) return;
    targets = targets.filter(Boolean);
    if (targets.length) units.push({ key, anchor, uid, layer, targets, mode: 'hide', ...extra });
  };

  for (const row of select(scope, '.shoutrow')) {
    add('chat', row, user(authorLink(row.querySelector('.shoutbox-userinfo'))), 'interaction');
  }
  for (const row of select(scope, '.fun-chat-row')) {
    add(
      'fun-comment',
      row,
      user(row.querySelector('.fun-chat-row-right > a.fun-chat-row-name')),
      'interaction',
    );
  }

  for (const header of select(scope, 'table.comment-table[id^="cid"],table[id^="pid"]')) {
    const container =
      header.parentElement?.tagName === 'DIV' && header.parentElement.children.length === 1
        ? header.parentElement
        : header;
    const body = container.nextElementSibling;
    if (!body?.matches('table.rowtable')) continue;
    const uid = user(authorLink(header));
    const isFirst =
      header === doc.querySelector('table[id^="pid"]') && /1楼/.test(clean(header.textContent));
    add('post', header, uid, 'interaction', [container, body], {
      protectedContent: path === '/forums.php' && isFirst && officialTopic(doc, url),
    });
  }

  // Only explicit attribution in the legend is evidence for a quoted author's UID.
  for (const quote of select(scope, 'fieldset,blockquote')) {
    const attribution = quote.querySelector(':scope > legend,:scope > [data-quote-author]');
    const uid =
      normalizeUid(quote.getAttribute('data-author-id')) ||
      user(attribution?.querySelector('a[href]'));
    add('quote', quote, uid, 'interaction');
  }
  for (const a of select(
    scope,
    `${CONTENT.split(',')
      .map((s) => `${s} a[href]`)
      .join(',')}`,
  )) {
    if (/^@/.test(a.textContent.trim()))
      add('mention', a, user(a), 'interaction', [a], { mode: 'mask' });
  }

  // List adapters use the actual column role. Last replier is never the topic author.
  for (const table of select(
    scope,
    'table.coltable,table.torrents,table#latest-torrent,table#sticky-torrent,table.latest-torrent,table.sticky-torrent',
  )) {
    if (table.closest(CONTENT)) continue;
    const rows = ownedRows(table);
    if (!rows.length) continue;
    const labels = [...rows[0].cells].map((c) => clean(c.textContent));
    let ownerColumn = -1,
      layer;
    if (path === '/forums.php' && url.searchParams.get('action') === 'viewforum') {
      ownerColumn = labels.indexOf('作者');
      layer = 'interaction';
    } else if (path === '/fun.php') {
      ownerColumn = labels.indexOf('发布者');
      layer = 'interaction';
    } else if (
      [
        '/',
        '/index.php',
        '/torrents.php',
        '/trial.php',
        '/subtitles.php',
        '/viewrequests.php',
      ].includes(path)
    ) {
      ownerColumn = labels.findIndex((s) => ['发布者', '上传者', '求种人', '应求者'].includes(s));
      layer = 'resource';
    }
    if (ownerColumn >= 0)
      for (const row of rows.slice(1)) {
        const a = authorLink(row.cells[ownerColumn]);
        const topic = row.querySelector('a[href*="action=viewtopic"]');
        const topicId =
          topic && new URL(topic.getAttribute('href'), url).searchParams.get('topicid');
        const protectedContent =
          path === '/forums.php' &&
          (url.searchParams.get('forumid') === '2' || OFFICIAL_TOPICS.has(topicId));
        add('listing', row, user(a), layer, [row], { protectedContent });
      }
    const identityColumn = labels.findIndex((s) =>
      ['用户名', '用户', '悬赏者', '做种者', '下载者'].includes(s),
    );
    if (
      identityColumn >= 0 &&
      [
        '/topten.php',
        '/fun.php',
        '/badges.php',
        '/viewrequests.php',
        '/viewsnatches.php',
        '/details.php',
        '/users.php',
      ].includes(path)
    ) {
      for (const row of rows.slice(1))
        add('user-row', row, user(authorLink(row.cells[identityColumn])), 'identity');
    }
    if (path === '/messages.php') {
      const sender = labels.indexOf('发讯者');
      if (sender >= 0)
        for (const row of rows.slice(1))
          add('message-row', row, user(authorLink(row.cells[sender])), 'interaction');
    }
    if (path === '/log.php' && labels.includes('事件'))
      for (const row of rows.slice(1)) {
        const event = row.cells[labels.indexOf('事件')];
        const a = authorLink(event);
        if (
          a &&
          /^(用户|发布者|管理员)\s/.test(event.textContent.trim()) &&
          event.textContent.indexOf(a.textContent) < 100
        )
          add('log-event', row, user(a), 'identity');
      }
  }

  // History pages attribute all entries by the route, never by links in quoted bodies.
  if (
    path === '/userhistory.php' &&
    ['viewcomments', 'viewposts', 'shoutbox', 'funcomment'].includes(url.searchParams.get('action'))
  ) {
    const uid = normalizeUid(url.searchParams.get('id'));
    for (const table of select(scope, 'table.coltable'))
      for (const row of ownedRows(table).slice(1)) add('history-row', row, uid, 'interaction');
    if (['viewcomments', 'viewposts'].includes(url.searchParams.get('action'))) {
      for (const table of select(scope, 'table.main').filter(
        (t) =>
          t.parentElement?.classList.contains('outer') || !t.parentElement?.closest('table.main'),
      )) {
        if (
          table.querySelector('td.comment,.bbcode-fullwidth') &&
          !table.querySelector('#info_block')
        )
          add('history-content', table, uid, 'interaction');
      }
    }
  }

  if (['/details.php', '/viewrequests.php', '/banner.php', '/bet.php'].includes(path)) {
    const candidates = [...doc.querySelectorAll('tr')].filter(
      (r) => r.cells.length === 2 && !r.closest(CONTENT) && !r.closest('#info_block'),
    );
    const ownerRow =
      candidates.find(
        (r) =>
          ['下载', '作者', '发布者', '发布信息'].includes(rowLabel(r)) && authorLink(r.cells[1]),
      ) ||
      candidates.find(
        (r) =>
          /^由\s/.test(r.cells[1].textContent.trim()) &&
          /发布于/.test(r.cells[1].textContent) &&
          authorLink(r.cells[1]),
      );
    const uid = user(authorLink(ownerRow?.cells[1]));
    if (uid) {
      const ownedLabels =
        /^(下载|副标题|基本信息|行为|外部链接|快捷搜索|简介|NFO|图片|传送门|作者|发布者|发布信息|发布时间|上架时间|标题|详情|内容|说明|求种名称|资源名称|竞猜主题|竞猜内容|开始时间|结束时间|豆瓣信息|Bangumi信息)$/;
      for (const row of candidates)
        if (ownedLabels.test(rowLabel(row)) || row === ownerRow) {
          if (scope === doc || scope.contains(row) || row.contains(scope))
            add('resource-detail', row, uid, 'resource');
        }
      for (const h of select(scope, 'h1'))
        if (!/评论/.test(h.textContent)) add('resource-title', h, uid, 'resource');
    }
  }

  if (path === '/messages.php' && url.searchParams.get('action') === 'viewmessage') {
    // Verified NexusPHP inbox detail: [自, 日期], sender/date, colspan body, actions.
    // The subject may precede the mailbox navigation table; never hide that navigation.
    for (const table of select(scope, 'td.outer > table')) {
      const rows = [...table.rows];
      const [header, sender, body] = rows;
      if (
        rows.length !== 4 ||
        header.cells.length !== 2 ||
        ![...header.cells].every((cell) => cell.matches('.colhead')) ||
        clean(header.cells[0].textContent) !== '自' ||
        clean(header.cells[1].textContent) !== '日期' ||
        sender.cells.length !== 2 ||
        body.cells.length !== 1 ||
        body.cells[0].colSpan !== 2 ||
        !body.cells[0].querySelector(':scope > .bbcode-fullwidth')
      )
        continue;
      const uid = user(authorLink(sender.cells[0]));
      let title = table.previousElementSibling;
      if (title?.matches('table.main') && title.querySelector('#pmboxnav'))
        title = title.previousElementSibling;
      add('message-inbox-detail', table, uid, 'interaction', [
        header,
        sender,
        body,
        title?.matches('h1') ? title : null,
      ]);
    }
    // Do not infer sender from a quoted link, recipient or arbitrary body user mention.
    const senderRow = [...doc.querySelectorAll('tr')].find(
      (r) => r.cells.length === 2 && ['发讯者', '发件人', '发送者'].includes(rowLabel(r)),
    );
    const uid = user(authorLink(senderRow?.cells[1]));
    if (uid) {
      add('message-sender', senderRow, uid, 'interaction');
      for (const body of select(scope, '.message-body,td.message,.message-content'))
        add('message-body', body, uid, 'interaction');
      // Known table layout: subject and content are labelled rows in the same message table.
      for (const row of senderRow.closest('table').rows)
        if (['主题', '内容', '正文'].includes(rowLabel(row)))
          add('message-detail', row, uid, 'interaction');
    }
  }

  if (path === '/userdetails.php') {
    const uid = normalizeUid(url.searchParams.get('id'));
    for (const outer of select(scope, 'td.outer')) add('profile', outer, uid, 'identity');
  }

  if (path === '/index.php' || path === '/' || path === '/fun.php') {
    const uid = findFunOwner(doc);
    if (uid) {
      for (const a of select(scope, 'a[href*="userdetails.php"]')) {
        const span = a.closest('span.nowrap') || a;
        if (user(a) === uid && /由\s*$/.test(span.previousSibling?.textContent || ''))
          add('fun-owner', span, uid, 'interaction');
      }
      // Outer work title; iframe comments stay mounted and are filtered separately.
      if (path === '/fun.php' && url.searchParams.get('action') === 'view')
        for (const p of select(scope, 'td.outer > p')) add('fun-title', p, uid, 'interaction');
    }
  }
  if (path.startsWith('/fun/') && context.funOwner) {
    for (const work of select(
      scope,
      '.funbox-image, #image-container, #fun-info-title, #fun-info-description, #fun-info-image-title, #fun-info-image-description, #funbox-title, #fun-title, .fun-title, #funbox-image-container, #funbox-image-list',
    )) {
      if (!work.querySelector('.fun-chat-row,.fun-chat-container'))
        add('fun-work', work, context.funOwner, 'interaction');
    }
  }

  // Conservative identity fallback: never climb to a row/container with mixed ownership.
  for (const a of select(scope, 'a[href*="userdetails.php"]')) {
    if (a.closest(IGNORED) || a.closest(CONTENT) || a.closest('legend')) continue;
    const uid = user(a);
    const span = a.closest('.givebonus-list') || a.closest('span.nowrap');
    const target =
      span && [...span.querySelectorAll('a[href*="userdetails.php"]')].every((x) => user(x) === uid)
        ? span
        : a;
    add('identity', a, uid, 'identity', [target]);
  }
  const protectedTargets = units.filter((u) => u.protectedContent).flatMap((u) => u.targets);
  // A mutation inside the first post may not include its separate author header in scope.
  // Carry page-level protection into these incremental scans as well.
  if (path === '/forums.php' && officialTopic(doc, url)) {
    const first = doc.querySelector('table[id^="pid"]');
    if (first && /1楼/.test(clean(first.textContent))) {
      const wrapper =
        first.parentElement?.tagName === 'DIV' && first.parentElement.children.length === 1
          ? first.parentElement
          : first;
      protectedTargets.push(wrapper);
      if (wrapper.nextElementSibling?.matches('table.rowtable'))
        protectedTargets.push(wrapper.nextElementSibling);
    }
  }
  for (const unit of units)
    if (protectedTargets.some((node) => node.contains(unit.anchor))) unit.protectedContent = true;
  return units;
}
