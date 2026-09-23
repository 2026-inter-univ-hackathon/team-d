const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../static/login/api.js'), 'utf8');
const plain = (value) => JSON.parse(JSON.stringify(value));

function setup({ user = { id: 'owner-1', email: 'alice@example.com' }, omitClients = false } = {}) {
  const calls = [];
  const rawAuth = { currentUser: { uid: 'owner-1' } };
  const db = { name: 'firestore' };
  const authClient = {
    auth: rawAuth,
    async signup(data) { calls.push(['signup', data]); return { user }; },
    async login(data) { calls.push(['login', data]); return { user }; },
    async logout() { calls.push(['logout']); },
    async resetPassword(data) { calls.push(['password-reset', data]); return { resetEmailSent: true }; },
    async currentUser() { calls.push(['currentUser']); return user; },
  };
  const eventsClient = {
    async list() { calls.push(['list']); return [{ id: 'event-1' }]; },
    async create(data) { calls.push(['create', data]); return { id: 'event-2', ...data }; },
    async update(id, data, version) { calls.push(['update', id, data, version]); return { id, ...data, version: version + 1 }; },
    async delete(id, version) { calls.push(['delete', id, version]); return { deleted: id }; },
    async import(records) { calls.push(['import', records]); return { imported: records.length, skipped: 0 }; },
  };
  const window = new EventTarget();
  Object.assign(window, {
    firebase: { firestore: () => db },
    FIREBASE_CONFIG: { apiKey: 'key', authDomain: 'demo.firebaseapp.com', projectId: 'demo', appId: 'app' },
    FIREBASE_APP_CHECK_CONFIG: { siteKey: 'site-key' },
    location: { hostname: 'localhost' },
  });
  if (!omitClients) {
    window.FirebaseAppClient = {
      initialize(options) { calls.push(['initialize-app', options]); },
    };
    window.FirebaseAuthClient = {
      create(options) { calls.push(['initialize-auth', options]); return authClient; },
    };
    window.FirebaseEventsClient = {
      create(options) { calls.push(['initialize-events', options]); return eventsClient; },
    };
  }
  let authRequired = 0;
  window.addEventListener('auth-required', () => { authRequired += 1; });
  vm.runInNewContext(source, { window, Event });
  return {
    api: window.LoginApi,
    calls,
    rawAuth,
    db,
    firebase: window.firebase,
    authRequired: () => authRequired,
  };
}

test('routes signup and login through Firebase Authentication', async () => {
  const { api, calls } = setup();
  const signup = {
    email: 'alice@example.com', username: 'Alice',
    password1: '123456', password2: '123456',
  };
  const login = { email: 'alice@example.com', password: '123456' };

  assert.deepEqual(await api.request('/api/auth/signup/', { method: 'POST', data: signup }), {
    user: { id: 'owner-1', email: 'alice@example.com' },
  });
  assert.deepEqual(await api.request('/api/auth/login/', { method: 'POST', data: login }), {
    user: { id: 'owner-1', email: 'alice@example.com' },
  });
  assert.deepEqual(calls.filter((call) => ['signup', 'login'].includes(call[0])), [
    ['signup', signup], ['login', login],
  ]);
  assert.equal(calls.filter((call) => call[0] === 'initialize-auth').length, 1);
  assert.equal(calls.filter((call) => call[0] === 'initialize-app').length, 1);
  assert.ok(
    calls.findIndex((call) => call[0] === 'initialize-app')
      < calls.findIndex((call) => call[0] === 'initialize-auth')
  );
});

test('restores the Firebase user and requests login when no session exists', async () => {
  const signedIn = setup();
  assert.deepEqual(plain(await signedIn.api.request('/api/auth/me/')), {
    user: { id: 'owner-1', email: 'alice@example.com' },
  });

  const signedOut = setup({ user: null });
  await assert.rejects(signedOut.api.request('/api/auth/me/'), (error) => error.status === 401);
  assert.equal(signedOut.authRequired(), 1);
});

test('routes calendar CRUD operations through the signed-in user Firestore client', async () => {
  const { api, calls, rawAuth, db, firebase } = setup();

  assert.deepEqual(plain(await api.request('/api/events/')), { events: [{ id: 'event-1' }] });
  assert.deepEqual(plain(await api.request('/api/events/', { method: 'POST', data: { title: '予定' } })), {
    event: { id: 'event-2', title: '予定' },
  });
  assert.deepEqual(plain(await api.request('/api/events/event-1/', {
    method: 'PATCH', data: { title: '変更', version: 2 },
  })), { event: { id: 'event-1', title: '変更', version: 3 } });
  assert.deepEqual(plain(await api.request('/api/events/event-1/', {
    method: 'DELETE', data: { version: 3 },
  })), { deleted: 'event-1' });

  const initialization = calls.find((call) => call[0] === 'initialize-events')[1];
  assert.equal(initialization.firebase, firebase);
  assert.equal(initialization.auth, rawAuth);
  assert.equal(initialization.db, db);
  assert.ok(calls.some((call) => call[0] === 'update' && call[3] === 2));
  assert.ok(calls.some((call) => call[0] === 'delete' && call[2] === 3));
});

test('imports legacy events through Firestore', async () => {
  const { api, calls } = setup();
  const records = [{ id: 'old', title: '以前の予定' }];

  assert.deepEqual(await api.request('/api/events/import/', {
    method: 'POST', data: { events: records },
  }), { imported: 1, skipped: 0 });
  assert.deepEqual(calls.find((call) => call[0] === 'import'), ['import', records]);
});

test('logs out with Firebase Authentication and rejects unsupported routes', async () => {
  const { api, calls } = setup();
  assert.deepEqual(plain(await api.request('/api/auth/logout/', { method: 'POST' })), { loggedOut: true });
  assert.ok(calls.some((call) => call[0] === 'logout'));
  await assert.rejects(api.request('/login/'), /接続先が正しくありません/);
  await assert.rejects(api.request('/api/unknown/'), (error) => error.status === 404);
});

test('routes password reset through Firebase Authentication', async () => {
  const { api, calls } = setup();
  const data = { email: 'alice@example.com' };
  assert.deepEqual(
    plain(await api.request('/api/auth/password-reset/', { method: 'POST', data })),
    { resetEmailSent: true }
  );
  assert.deepEqual(calls.find((call) => call[0] === 'password-reset'), [
    'password-reset', data,
  ]);
});

test('reports missing Firebase client scripts before making a request', async () => {
  const { api } = setup({ omitClients: true });
  await assert.rejects(api.request('/api/auth/me/'), (error) => error.status === 0);
});
