import { JSDOM } from 'jsdom';
export const ACCOUNT = '12345',
  BLOCKED = '10001',
  OTHER = '210001';
export const link = (uid = BLOCKED, name = '示例用户') =>
  `<span class="nowrap"><a href="/userdetails.php?id=${uid}"><span>${name}</span></a></span>`;
export const nav = () => `<div id="info_block">${link(ACCOUNT, '当前账号')}</div>`;
export function page(body, path = '/index.php') {
  return new JSDOM(`<!doctype html><html><head></head><body>${nav()}${body}</body></html>`, {
    url: `https://byr.pt${path}`,
    pretendToBeVisual: true,
  });
}
export const chat = (uid = BLOCKED, id = 'chat1', content = '正文') =>
  `<table><tbody><tr><td class="shoutrow" id="${id}"><div class="shoutbox-userinfo">${link(uid)}</div><div class="shoutbox-text"><div class="bbcode-notfullwidth">${content}</div></div></td></tr></tbody></table>`;
export const fun = (uid = BLOCKED, id = 'fun1') =>
  `<div class="fun-chat-row" id="${id}"><div class="fun-chat-row-head"><img alt="头像"></div><div class="fun-chat-row-right"><a class="fun-chat-row-name" href="/userdetails.php?id=${uid}">示例用户</a><div class="fun-chat-row-content">示例评论</div></div></div>`;
export const post = (uid = BLOCKED, id = 'cid111', content = '示例正文', floor = '') =>
  `<div><table id="${id}" class="full ${id.startsWith('cid') ? 'comment-table' : 'tight'}"><tbody><tr><td>${link(uid)} ${floor}</td></tr></tbody></table></div><table class="full rowtable" id="body-${id}"><tbody><tr><td><img alt="头像"></td><td><div class="bbcode-fullwidth">${content}</div><button id="event-${id}">示例操作</button></td></tr></tbody></table>`;
export function memoryGM(initial = {}) {
  const data = new Map(Object.entries(initial)),
    listeners = new Map();
  let serial = 0;
  return {
    data,
    get: (k, v) => (data.has(k) ? structuredClone(data.get(k)) : v),
    set(k, v) {
      const old = data.get(k);
      data.set(k, structuredClone(v));
      for (const { key, fn } of listeners.values()) if (key === k) fn(k, old, v, true);
    },
    listen(key, fn) {
      const id = ++serial;
      listeners.set(id, { key, fn });
      return id;
    },
    unlisten: (id) => listeners.delete(id),
    menu: () => 1,
    unmenu: () => {},
  };
}
export const settle = (ms = 5) => new Promise((resolve) => setTimeout(resolve, ms));
