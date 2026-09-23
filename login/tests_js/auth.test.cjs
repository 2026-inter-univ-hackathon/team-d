const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../static/login/auth.js'), 'utf8');

// Exercise the actual submit handler with a small form adapter; no browser/server required.
function setup({ mode = 'login', values = {}, request, successUrl, missingForm = false } = {}) {
  const fields = {
    email: ' alice@example.com ', username: ' 山田 太郎 ',
    password: '123456', password1: '123456', password2: '123456', ...values,
  };
  const passwordNames = mode === 'signup' ? ['password1', 'password2'] : ['password'];
  const passwords = passwordNames.map(name => ({ value: fields[name] }));
  const button = { textContent: mode === 'signup' ? '新規登録' : 'ログイン', disabled: false };
  const resetButton = mode === 'login'
    ? { textContent: 'パスワード再設定メールを送る', disabled: false, addEventListener(name, fn) { assert.equal(name, 'click'); resetHandler = fn; } }
    : null;
  const errors = { textContent: '' };
  const info = { textContent: '' };
  const calls = [];
  const order = [];
  const redirects = [];
  let handler;
  let resetHandler;
  let prevented = 0;
  const form = {
    dataset: { mode, ...(successUrl ? { successUrl } : {}) },
    addEventListener(name, fn) { assert.equal(name, 'submit'); handler = fn; },
    querySelector(selector) { assert.equal(selector, 'button[type="submit"]'); return button; },
    querySelectorAll(selector) { assert.equal(selector, 'input[type="password"]'); return passwords; },
  };
  const sandbox = {
    document: { getElementById(id) {
      if (id === 'auth-form') return missingForm ? null : form;
      if (id === 'auth-error') return errors;
      if (id === 'auth-info') return info;
      if (id === 'password-reset') return resetButton;
      throw Error(`Unexpected element: ${id}`);
    } },
    FormData: class {
      constructor(element) { assert.equal(element, form); }
      get(name) { return fields[name] ?? null; }
    },
    LoginApi: {
      async request(endpoint, options) {
        calls.push({ endpoint, options });
        order.push('request');
        if (request) return request(endpoint, options);
        return endpoint === '/api/auth/signup/'
          ? { verificationSent: true }
          : { user: { id: 'user-1' } };
      },
    },
    window: { location: { assign(url) { redirects.push(url); order.push('redirect'); } } },
  };
  vm.runInNewContext(source, sandbox);
  return { calls, order, redirects, button, resetButton, errors, info, passwords, fields,
    handler: () => handler,
    prevented: () => prevented,
    submit: () => handler({ preventDefault() { prevented++; } }),
    resetPassword: () => resetHandler(),
  };
}

test('login sends credentials to Firebase adapter before navigation and clears password', async () => {
  const state = setup({ successUrl: '/team-d/index.html', values: { password: ' secret ' } });
  await state.submit();
  assert.equal(state.calls[0].endpoint, '/api/auth/login/');
  assert.equal(state.calls[0].options.method, 'POST');
  assert.equal(state.calls[0].options.authenticated, undefined);
  assert.deepEqual(JSON.parse(JSON.stringify(state.calls[0].options.data)), {
    email: 'alice@example.com', password: ' secret ',
  });
  assert.deepEqual(state.order, ['request', 'redirect']);
  assert.deepEqual(state.redirects, ['/team-d/index.html']);
  assert.equal(state.passwords[0].value, '');
  assert.equal(state.button.disabled, false);
  assert.equal(state.button.textContent, 'ログイン');
  assert.equal(state.prevented(), 1);
});

test('signup shows verification guidance without opening the calendar', async () => {
  const state = setup({ mode: 'signup' });
  await state.submit();
  assert.equal(state.calls[0].endpoint, '/api/auth/signup/');
  assert.deepEqual(JSON.parse(JSON.stringify(state.calls[0].options.data)), {
    email: 'alice@example.com', username: '山田 太郎',
    password1: '123456', password2: '123456',
  });
  assert.ok(state.passwords.every(input => input.value === ''));
  assert.deepEqual(state.redirects, []);
  assert.match(state.info.textContent, /確認メールを送信/);
  assert.equal(state.button.textContent, '新規登録');
});

test('validation messages are shown as text with labels and input stays available', async () => {
  const error = Object.assign(new Error('入力を確認してください。'), { details: { fields: {
    username: [{ message: '<b>登録済み</b>' }],
    password2: [{ message: '一致しません。' }],
    __all__: [{ message: '全体のエラー' }],
  } } });
  const state = setup({ mode: 'signup', request: async () => { throw error; } });
  await state.submit();
  assert.equal(state.errors.textContent, 'ユーザー名：<b>登録済み</b>\n確認用パスワード：一致しません。\n全体のエラー');
  assert.equal(state.passwords[0].value, '123456');
  assert.equal(state.button.disabled, false);
  assert.deepEqual(state.redirects, []);
});

test('network failure restores button and permits retry', async () => {
  let attempts = 0;
  const state = setup({ request: async () => {
    if (++attempts === 1) throw new Error('通信できませんでした。');
    return { user: { id: 'user-1' } };
  } });
  await state.submit();
  assert.equal(state.errors.textContent, '通信できませんでした。');
  assert.equal(state.button.disabled, false);
  assert.equal(state.button.textContent, 'ログイン');
  assert.equal(state.passwords[0].value, '123456');
  await state.submit();
  assert.equal(state.errors.textContent, '');
  assert.equal(state.calls.length, 2);
  assert.deepEqual(state.redirects, ['/']);
});

test('pending request prevents double submission', async () => {
  let finish;
  const state = setup({ request: () => new Promise(resolve => { finish = resolve; }) });
  const pending = state.submit();
  assert.equal(state.button.disabled, true);
  assert.equal(state.button.textContent, '処理しています…');
  await state.submit();
  assert.equal(state.calls.length, 1);
  finish({ user: { id: 'user-1' } });
  await pending;
  assert.deepEqual(state.redirects, ['/']);
});

test('Firebase login failure does not navigate or clear password', async () => {
  const state = setup({ request: async () => { throw new Error('メールアドレスまたはパスワードが違います。'); } });
  await state.submit();
  assert.equal(state.errors.textContent, 'メールアドレスまたはパスワードが違います。');
  assert.equal(state.passwords[0].value, '123456');
  assert.equal(state.button.disabled, false);
  assert.deepEqual(state.redirects, []);
});

test('password reset uses the entered email and shows a neutral result', async () => {
  const state = setup();
  await state.resetPassword();
  assert.equal(state.calls[0].endpoint, '/api/auth/password-reset/');
  assert.deepEqual(JSON.parse(JSON.stringify(state.calls[0].options.data)), {
    email: 'alice@example.com',
  });
  assert.match(state.info.textContent, /登録状況にかかわらず/);
  assert.equal(state.resetButton.disabled, false);
  assert.deepEqual(state.redirects, []);
});

test('missing form leaves page untouched', () => {
  const state = setup({ missingForm: true });
  assert.equal(state.handler(), undefined);
  assert.deepEqual(state.calls, []);
  assert.deepEqual(state.redirects, []);
});
