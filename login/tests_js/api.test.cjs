const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../static/login/api.js'), 'utf8');

function setup({ status = 200, result = { events: [] }, fetchError, invalidJson, config, storageError } = {}) {
  const calls = [];
  const storage = new Map();
  const window = new EventTarget();
  window.location = { origin: 'http://localhost:8000' };
  window.APP_CONFIG = config;
  let authRequired = 0;
  window.addEventListener('auth-required', () => { authRequired++; });
  const sandbox = {
    window, URL, Event,
    AbortSignal: { timeout(ms) { assert.equal(ms, 15000); return AbortSignal.timeout(ms); } },
    sessionStorage: {
      setItem(key, value) { if (storageError) throw Error('storage blocked'); storage.set(key, value); },
      getItem(key) { if (storageError) throw Error('storage blocked'); return storage.get(key) ?? null; },
      removeItem(key) { storage.delete(key); },
    },
    async fetch(url, options) {
      calls.push({ url: url.href, options });
      if (fetchError) throw fetchError;
      return { ok: status >= 200 && status < 300, status, async json() {
        if (invalidJson) throw new Error('not JSON');
        return result;
      } };
    },
  };
  vm.runInNewContext(source, sandbox);
  return { api: window.LoginApi, calls, storage, authRequired: () => authRequired };
}

test('token can be saved, read and cleared; invalid tokens are rejected', () => {
  const { api, storage } = setup();
  assert.equal(api.getToken(), null);
  api.saveToken('test-token');
  assert.equal(api.getToken(), 'test-token');
  assert.equal(storage.size, 1);
  api.clearToken();
  assert.equal(api.getToken(), null);
  for (const token of ['', null, 123, {}]) assert.throws(() => api.saveToken(token), /正しくありません/);
});

test('login sends JSON without cookies or Authorization and does not store the password', async () => {
  const { api, calls, storage } = setup({ result: { token: 'issued-token' } });
  const result = await api.request('/api/auth/login/', {
    method: 'POST', authenticated: false, data: { username: 'alice', password: '123456' },
  });
  const { url, options } = calls[0];
  assert.equal(url, 'http://localhost:8000/api/auth/login/');
  assert.equal(options.method, 'POST');
  assert.equal(options.headers.Authorization, undefined);
  assert.equal(options.headers['Content-Type'], 'application/json');
  assert.deepEqual(JSON.parse(options.body), { username: 'alice', password: '123456' });
  assert.equal(options.credentials, 'omit');
  assert.equal(options.cache, 'no-store');
  assert.equal(options.redirect, 'error');
  assert.ok(options.signal instanceof AbortSignal);
  assert.equal(storage.size, 0);
  api.saveToken(result.token);
  assert.deepEqual([...storage.values()], ['issued-token']);
});

test('authenticated request attaches Bearer token and uses configured API origin', async () => {
  const { api, calls } = setup({ config: { apiBaseUrl: 'https://api.example.com/' } });
  api.saveToken('test-token');
  await api.request('/api/events/');
  assert.equal(calls[0].url, 'https://api.example.com/api/events/');
  assert.equal(calls[0].options.headers.Authorization, 'Bearer test-token');
  assert.equal(calls[0].options.headers['Content-Type'], undefined);
  assert.equal(calls[0].options.body, undefined);
});

test('missing token requests login without making a network request', async () => {
  const { api, calls, authRequired } = setup();
  await assert.rejects(api.request('/api/events/'), error => error.status === 401);
  assert.equal(authRequired(), 1);
  assert.equal(calls.length, 0);
});

test('401 on authenticated request clears token and requests login', async () => {
  const { api, authRequired } = setup({ status: 401 });
  api.saveToken('expired-token');
  await assert.rejects(api.request('/api/events/'), error => error.status === 401);
  assert.equal(api.getToken(), null);
  assert.equal(authRequired(), 1);
});

test('failed login preserves existing token and shows server error without redirect event', async () => {
  const { api, authRequired } = setup({ status: 401, result: { error: 'パスワードが違います。' } });
  api.saveToken('existing-token');
  await assert.rejects(api.request('/api/auth/login/', { method: 'POST', authenticated: false, data: {} }),
    error => error.status === 401 && error.message === 'パスワードが違います。');
  assert.equal(api.getToken(), 'existing-token');
  assert.equal(authRequired(), 0);
});

test('network failure and timeout preserve token and expose connection error', async () => {
  for (const fetchError of [new Error('offline'), new DOMException('timeout', 'TimeoutError')]) {
    const { api, authRequired } = setup({ fetchError });
    api.saveToken('test-token');
    await assert.rejects(api.request('/api/events/'), error => error.status === 0 && /通信できません/.test(error.message));
    assert.equal(api.getToken(), 'test-token');
    assert.equal(authRequired(), 0);
  }
});

test('field validation errors are available to the form', async () => {
  const fields = { username: [{ message: '登録済み', code: 'unique' }] };
  const { api } = setup({ status: 400, result: { error: '入力内容を確認してください。', fields } });
  await assert.rejects(api.request('/api/auth/signup/', { method: 'POST', authenticated: false, data: {} }),
    error => error.status === 400 && error.details.fields === fields);
});

test('non-JSON server errors and invalid success responses are not treated as success', async () => {
  for (const status of [200, 502]) {
    const { api } = setup({ status, invalidJson: true });
    api.saveToken('test-token');
    await assert.rejects(api.request('/api/events/'), error => error.status === status);
    assert.equal(api.getToken(), 'test-token');
  }
});

test('storage failure is reported and does not send an unauthenticated request', async () => {
  const { api, calls } = setup({ storageError: true });
  assert.throws(() => api.saveToken('test-token'), /保存できません/);
  await assert.rejects(api.request('/api/events/'), /読み込めません/);
  assert.equal(calls.length, 0);
});

test('non-API paths are rejected before token or network access', async () => {
  const { api, calls } = setup();
  for (const path of ['/login/', 'https://other.example/api/events/', '//other.example/api/']) {
    await assert.rejects(api.request(path), /接続先が正しくありません/);
  }
  assert.equal(calls.length, 0);
});
