export const VERSION = 1;
export const SITE = 'https://byr.pt';
export const LAYERS = ['interaction', 'resource', 'identity'];
export const DEFAULTS = Object.freeze({ interaction: true, resource: false, identity: false });

export function normalizeUid(value) {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  if (typeof value === 'number' && !Number.isSafeInteger(value)) return null;
  const s = String(value)
    .trim()
    .replace(/^0+(?=\d)/, '');
  return /^[1-9]\d{0,15}$/.test(s) ? s : null;
}

export function uidFromHref(href, base = SITE) {
  if (typeof href !== 'string' || !href.trim()) return null;
  try {
    const url = new URL(href, base);
    if (
      url.origin !== SITE ||
      url.pathname !== '/userdetails.php' ||
      url.searchParams.getAll('id').length !== 1
    )
      return null;
    return normalizeUid(url.searchParams.get('id'));
  } catch {
    return null;
  }
}

export function parseUserInput(text) {
  return normalizeUid(text) || uidFromHref(text);
}

export function emptyConfig(accountId) {
  const id = normalizeUid(accountId);
  if (!id) throw new Error('无法确认当前账号 UID');
  return { version: VERSION, accountId: id, defaults: { ...DEFAULTS }, users: {} };
}

function rules(value, partial = false) {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('规则格式不正确');
  const result = {};
  for (const key of LAYERS) {
    if (partial && value[key] === undefined) continue;
    if (typeof value[key] !== 'boolean') throw new Error(`规则 ${key} 必须为布尔值`);
    result[key] = value[key];
  }
  return result;
}

export function validateConfig(raw) {
  if (!raw || raw.version !== VERSION) throw new Error('不支持的配置版本');
  const config = emptyConfig(raw.accountId);
  config.defaults = rules(raw.defaults);
  if (!raw.users || typeof raw.users !== 'object' || Array.isArray(raw.users))
    throw new Error('名单格式不正确');
  const entries = Object.entries(raw.users);
  if (entries.length > 10000) throw new Error('名单最多包含 10000 个用户');
  for (const [key, user] of entries) {
    const uid = normalizeUid(key);
    if (!uid || key !== uid || !user || normalizeUid(user.uid) !== uid)
      throw new Error('名单中存在无效 UID');
    if (uid === config.accountId) continue;
    config.users[uid] = {
      uid,
      name: String(user.name || '').slice(0, 100),
      overrides: rules(user.overrides || {}, true),
    };
  }
  return config;
}

export function addUser(config, uid, name = '') {
  uid = normalizeUid(uid);
  if (!uid) throw new Error('请输入数字 UID 或本站个人页链接');
  if (uid === config.accountId) throw new Error('不能屏蔽当前登录账号');
  config.users[uid] ??= { uid, name: String(name).slice(0, 100), overrides: {} };
  return config;
}

export function mergeConfig(current, imported) {
  const result = validateConfig(current);
  const other = validateConfig(imported);
  for (const user of Object.values(other.users))
    if (user.uid !== current.accountId) addUser(result, user.uid, user.name);
  // Existing overrides/defaults win; new entries carry the imported per-user choices.
  for (const [id, user] of Object.entries(other.users)) {
    if (!current.users[id] && id !== current.accountId)
      result.users[id].overrides = { ...user.overrides };
  }
  return result;
}

export function shouldBlock(config, uid, layer, protectedContent = false) {
  if (!config || protectedContent || uid === config.accountId) return false;
  const user = config.users[uid];
  return Boolean(user && (user.overrides[layer] ?? config.defaults[layer]));
}

export function currentAccount(doc) {
  const container = doc.querySelector('#info_block') || doc.querySelector('#nav_block, .nav_block');
  if (!container) return null;
  for (const a of container.querySelectorAll('a[href]')) {
    const id = uidFromHref(a.getAttribute('href'));
    if (id) return id;
  }
  return null;
}

export function nativeBlacklist(doc) {
  // The delete-link type identifies the blacklist section; never follow these links.
  const result = new Map();
  for (const control of doc.querySelectorAll('a[href]')) {
    let url;
    try {
      url = new URL(control.getAttribute('href'), SITE);
    } catch {
      continue;
    }
    if (
      url.origin !== SITE ||
      url.pathname !== '/friends.php' ||
      url.searchParams.get('type') !== 'block' ||
      url.searchParams.get('action') !== 'delete'
    )
      continue;
    const id = normalizeUid(url.searchParams.get('targetid'));
    const row = control.closest('td,li');
    const a =
      row &&
      [...row.querySelectorAll('a[href]')].find((a) => uidFromHref(a.getAttribute('href')) === id);
    if (id && a) result.set(id, { uid: id, name: a.textContent.trim() });
  }
  return [...result.values()];
}
