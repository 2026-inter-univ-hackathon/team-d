const test = require('node:test');
const assert = require('node:assert/strict');

const FirebaseAuthClient = require('../static/login/firebase-auth.js');

const config = {
  apiKey: 'public-key',
  authDomain: 'demo.firebaseapp.com',
  projectId: 'demo',
  appId: 'web-app-id',
};

function fakeFirebase(changes = {}) {
  const calls = [];
  const auth = {
    setPersistence: async (value) => calls.push(['persistence', value]),
    createUserWithEmailAndPassword: async (email, password) => ({
      user: { uid: 'new-user', email },
    }),
    signInWithEmailAndPassword: async (email, password) => ({
      user: { uid: 'login-user', email },
    }),
    signOut: async () => calls.push(['logout']),
    onAuthStateChanged: (success) => {
      queueMicrotask(() => success(changes.currentUser || null));
      return () => calls.push(['unsubscribe']);
    },
    ...changes.auth,
  };
  const authFactory = () => auth;
  authFactory.Auth = { Persistence: { SESSION: 'session' } };
  const firebase = {
    apps: [],
    auth: authFactory,
    initializeApp: (received) => {
      calls.push(['initialize', received]);
      return { auth: () => auth };
    },
  };
  return { firebase, auth, calls };
}

test('normalizes a valid username into the fixed example.com address', () => {
  assert.equal(FirebaseAuthClient.accountEmail(' Alice_01 '), 'alice_01@example.com');
  for (const username of ['', '.alice', 'alice@example.com', '日本語', 'a'.repeat(33), null]) {
    assert.throws(() => FirebaseAuthClient.accountEmail(username), FirebaseAuthClient.FirebaseAuthError);
  }
});

test('requires complete public Firebase configuration before initializing', () => {
  const { firebase, calls } = fakeFirebase();
  for (const key of Object.keys(config)) {
    assert.throws(
      () => FirebaseAuthClient.create({ firebase, config: { ...config, [key]: '' } }),
      /接続設定/
    );
  }
  assert.deepEqual(calls, []);
});

test('sets tab-scoped persistence and signs up with normalized credentials', async () => {
  const setup = fakeFirebase();
  const calls = [];
  setup.auth.createUserWithEmailAndPassword = async (...args) => {
    calls.push(args);
    return { user: { uid: 'uid-1', email: args[0] } };
  };
  const client = FirebaseAuthClient.create({ firebase: setup.firebase, config });
  assert.equal(client.auth, setup.auth);

  const result = await client.signup({
    username: ' Alice ', password1: '123456', password2: '123456',
  });

  assert.deepEqual(setup.calls[0], ['initialize', config]);
  assert.deepEqual(setup.calls[1], ['persistence', 'session']);
  assert.deepEqual(calls, [['alice@example.com', '123456']]);
  assert.deepEqual(result, { user: { id: 'uid-1', email: 'alice@example.com' } });
});

test('rejects short and mismatched passwords before contacting Firebase', async () => {
  const setup = fakeFirebase();
  let requests = 0;
  setup.auth.createUserWithEmailAndPassword = async () => { requests += 1; };
  const client = FirebaseAuthClient.create({ firebase: setup.firebase, config });

  await assert.rejects(
    client.signup({ username: 'alice', password1: '12345', password2: '12345' }),
    /6文字以上/
  );
  await assert.rejects(
    client.signup({ username: 'alice', password1: '123456', password2: '654321' }),
    /一致しません/
  );
  assert.equal(requests, 0);
});

test('accepts numeric and username-like six-character passwords', async () => {
  const setup = fakeFirebase();
  const passwords = [];
  setup.auth.createUserWithEmailAndPassword = async (email, password) => {
    passwords.push(password);
    return { user: { uid: password, email } };
  };
  const client = FirebaseAuthClient.create({ firebase: setup.firebase, config });

  await client.signup({ username: 'numeric', password1: '123456', password2: '123456' });
  await client.signup({ username: 'alice1', password1: 'alice1', password2: 'alice1' });
  assert.deepEqual(passwords, ['123456', 'alice1']);
});

test('logs in, restores the current user, and logs out without storing a password', async () => {
  const setup = fakeFirebase({
    currentUser: { uid: 'restored-user', email: 'restored@example.com' },
  });
  const loginCalls = [];
  setup.auth.signInWithEmailAndPassword = async (...args) => {
    loginCalls.push(args);
    return { user: { uid: 'login-user', email: args[0] } };
  };
  const client = FirebaseAuthClient.create({ firebase: setup.firebase, config });

  assert.deepEqual(
    await client.login({ username: 'ALICE', password: 'secret1' }),
    { user: { id: 'login-user', email: 'alice@example.com' } }
  );
  assert.deepEqual(await client.currentUser(), {
    id: 'restored-user', email: 'restored@example.com',
  });
  await client.logout();

  assert.deepEqual(loginCalls, [['alice@example.com', 'secret1']]);
  assert.ok(setup.calls.some((call) => call[0] === 'unsubscribe'));
  assert.ok(setup.calls.some((call) => call[0] === 'logout'));
  assert.equal(JSON.stringify(setup.calls).includes('secret1'), false);
});

test('converts Firebase errors to safe Japanese messages', async () => {
  const setup = fakeFirebase({
    auth: {
      signInWithEmailAndPassword: async () => {
        throw { code: 'auth/invalid-credential', message: 'internal detail' };
      },
    },
  });
  const client = FirebaseAuthClient.create({ firebase: setup.firebase, config });

  await assert.rejects(
    client.login({ username: 'alice', password: 'wrong1' }),
    (error) => {
      assert.equal(error.message, 'ユーザー名またはパスワードが違います。');
      assert.equal(error.code, 'auth/invalid-credential');
      assert.equal(error.message.includes('internal detail'), false);
      return true;
    }
  );
});
