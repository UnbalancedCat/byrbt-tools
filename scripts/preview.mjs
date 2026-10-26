// Local development harness. Never included in the release userscript.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
const port = Number(process.env.BYRBT_PREVIEW_PORT || 8713);
const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${port}`);
  res.setHeader('Access-Control-Allow-Origin', 'https://byr.pt');
  res.setHeader('Access-Control-Allow-Private-Network', 'true');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') {
    res.writeHead(204, { 'Access-Control-Allow-Methods': 'GET, OPTIONS' });
    res.end();
    return;
  }
  if (req.method !== 'GET') {
    res.writeHead(405);
    res.end();
    return;
  }
  try {
    if (url.pathname === '/byrbt-tools.user.js') {
      res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8' });
      res.end(await readFile('dist/byrbt-tools.user.js'));
      return;
    }
    if (url.pathname === '/harness.js') {
      const uid = url.searchParams.get('uid') || '';
      if (uid && !/^[1-9]\d{0,15}$/.test(uid)) {
        res.writeHead(400);
        res.end();
        return;
      }
      const identity = url.searchParams.get('identity') === '1',
        resource = url.searchParams.get('resource') === '1';
      const source = await readFile('dist/byrbt-tools.user.js', 'utf8');
      const shim = `(()=>{if(window.__byrbtHarness)throw new Error('Reload before another harness injection');
const values=new Map(),callbacks=new Map();let next=0;
const GM_getValue=(k,def)=>{if(!values.has(k)){const id=k.match(/:account:(\\d+)$/)?.[1];if(id)values.set(k,{version:1,accountId:id,defaults:{interaction:true,resource:${resource},identity:${identity}},users:${JSON.stringify(uid)}&&id!==${JSON.stringify(uid)}?{[${JSON.stringify(uid)}]:{uid:${JSON.stringify(uid)},name:'测试用户',overrides:{}}}:{}});}return values.has(k)?structuredClone(values.get(k)):def;};
const GM_setValue=(k,v)=>{const old=values.get(k);values.set(k,structuredClone(v));for(const {key,fn} of callbacks.values())if(key===k)fn(k,old,v,true);};
const GM_addValueChangeListener=(key,fn)=>{const id=++next;callbacks.set(id,{key,fn});return id;};
const GM_removeValueChangeListener=id=>callbacks.delete(id);
const GM_registerMenuCommand=(name,fn)=>{window.__byrbtHarness.open=fn;return 1;};const GM_unregisterMenuCommand=()=>{};
window.__byrbtHarness={values,gmGet:GM_getValue,gmSet:GM_setValue};
${source}\n})();`;
      res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8' });
      res.end(shim);
      return;
    }
    if (url.pathname === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(
        '<!doctype html><html lang="zh"><title>BYRBT Tools 本地安装包</title><h1>BYRBT Tools</h1><p><a href="/byrbt-tools.user.js">安装 / 下载 userscript</a></p><p>harness.js 仅用于开发测试，模拟 GM 存储；关闭或刷新测试页面即丢弃。</p></html>',
      );
      return;
    }
    res.writeHead(404);
    res.end();
  } catch {
    res.writeHead(500);
    res.end('Build the userscript first.');
  }
});
server.listen(port, '127.0.0.1', () =>
  console.log(`Local preview: http://127.0.0.1:${port} (loopback only)`),
);
