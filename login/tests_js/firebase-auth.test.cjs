const test = require('node:test');
const assert = require('node:assert/strict');

const FirebaseAuthClient = require('../static/login/firebase-auth.js');

const config = {
  apiKey: 'public-key',
  authDomain: 'demo.firebaseapp.com',
  projectId: 'demo',
  appId: 'web-app-id',
};

function fakeUser(uid, email, displayName = '', emailVerified = true, calls = []) {
  return {
    uid,
    email,
    displayName,
    emailVerified,
    async updateProfile(profile) { this.displayName = profile.displayName; },
    async sendEmailVerification() { calls.push(['verification', email]); },
  };
}

function fakeFirebase(changes = {}) {
  const calls = [];
  const auth = {
    setPersistence: async (value) => calls.push(['persistence', value]),
    createUserWithEmailAndPassword: async (email, password) => ({
      user: fakeUser('new-user', email, '', false, calls),
    }),
    signInWithEmailAndPassword: async (email, password) => ({
      user: fakeUser('login-user', email, 'ログインユーザー'),
    }),
    signOut: async () => calls.push(['logout']),
    sendPasswordResetEmail: async (email) => calls.push(['password-reset', email]),
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

test('normalizes email addresses and validates display names', () => {
  assert.equal(FirebaseAuthClient.normalizeEmail(' Alice@Example.COM '), 'alice@example.com');
  assert.equal(FirebaseAuthClient.normalizeUsername(' 山田 太郎 '), '山田 太郎');
  for (const email of ['', 'alice', '@example.com', 'alice@', null]) {
    assert.throws(() => FirebaseAuthClient.normalizeEmail(email), FirebaseAuthClient.FirebaseAuthError);
  }
  for (const username of ['', 'a'.repeat(33), null]) {
    assert.throws(() => FirebaseAuthClient.normalizeUsername(username), FirebaseAuthClient.FirebaseAuthError);
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
    return { user: fakeUser('uid-1', args[0], '', false, setup.calls) };
  };
  const client = FirebaseAuthClient.create({ firebase: setup.firebase, config });
  assert.equal(client.auth, setup.auth);

  const result = await client.signup({
    email: ' Alice@Example.COM ', username: ' Alice ',
    password1: '123456', password2: '123456',
  });

  assert.deepEqual(setup.calls[0], ['initialize', config]);
  assert.deepEqual(setup.calls[1], ['persistence', 'session']);
  assert.deepEqual(calls, [['alice@example.com', '123456']]);
  assert.deepEqual(result, { verificationSent: true, email: 'alice@example.com' });
  assert.ok(setup.calls.some((call) => call[0] === 'verification'));
  assert.ok(setup.calls.some((call) => call[0] === 'logout'));
});

test('rejects short and mismatched passwords before contacting Firebase', async () => {
  const setup = fakeFirebase();
  let requests = 0;
  setup.auth.createUserWithEmailAndPassword = async () => { requests += 1; };
  const client = FirebaseAuthClient.create({ firebase: setup.firebase, config });

  await assert.rejects(
    client.signup({ email: 'alice@example.com', username: 'alice', password1: '12345', password2: '12345' }),
    /6文字以上/
  );
  await assert.rejects(
    client.signup({ email: 'alice@example.com', username: 'alice', password1: '123456', password2: '654321' }),
    /一致しません/
  );
  assert.equal(requests, 0);
});

test('accepts numeric and username-like six-character passwords', async () => {
  const setup = fakeFirebase();
  const passwords = [];
  setup.auth.createUserWithEmailAndPassword = async (email, password) => {
    passwords.push(password);
    return { user: fakeUser(password, email) };
  };
  const client = FirebaseAuthClient.create({ firebase: setup.firebase, config });

  await client.signup({ email: 'numeric@example.com', username: 'numeric', password1: '123456', password2: '123456' });
  await client.signup({ email: 'alice@example.com', username: 'alice1', password1: 'alice1', password2: 'alice1' });
  assert.deepEqual(passwords, ['123456', 'alice1']);
});

test('logs in, restores the current user, and logs out without storing a password', async () => {
  const setup = fakeFirebase({
    currentUser: fakeUser('restored-user', 'restored@example.com', '復元ユーザー'),
  });
  const loginCalls = [];
  setup.auth.signInWithEmailAndPassword = async (...args) => {
    loginCalls.push(args);
    return { user: fakeUser('login-user', args[0], 'Alice') };
  };
  const client = FirebaseAuthClient.create({ firebase: setup.firebase, config });

  assert.deepEqual(
    await client.login({ email: 'ALICE@EXAMPLE.COM', password: 'secret1' }),
    { user: { id: 'login-user', email: 'alice@example.com', username: 'Alice' } }
  );
  assert.deepEqual(await client.currentUser(), {
    id: 'restored-user', email: 'restored@example.com', username: '復元ユーザー',
  });
  await client.logout();

  assert.deepEqual(loginCalls, [['alice@example.com', 'secret1']]);
  assert.ok(setup.calls.some((call) => call[0] === 'unsubscribe'));
  assert.ok(setup.calls.some((call) => call[0] === 'logout'));
  assert.equal(JSON.stringify(setup.calls).includes('secret1'), false);
});

test('rejects an unverified login, resends verification, and signs out', async () => {
  const setup = fakeFirebase();
  setup.auth.signInWithEmailAndPassword = async (email) => ({
    user: fakeUser('unverified', email, 'Alice', false, setup.calls),
  });
  const client = FirebaseAuthClient.create({ firebase: setup.firebase, config });

  await assert.rejects(
    client.login({ email: 'alice@example.com', password: '123456' }),
    (error) => error.code === 'auth/email-not-verified' && /再送/.test(error.message)
  );
  assert.ok(setup.calls.some((call) => call[0] === 'verification'));
  assert.ok(setup.calls.some((call) => call[0] === 'logout'));
});

test('signs out a restored session when its email is not verified', async () => {
  const setup = fakeFirebase({
    currentUser: fakeUser('unverified', 'alice@example.com', 'Alice', false),
  });
  const client = FirebaseAuthClient.create({ firebase: setup.firebase, config });

  assert.equal(await client.currentUser(), null);
  assert.ok(setup.calls.some((call) => call[0] === 'logout'));
});

test('sends password reset without revealing an unknown account', async () => {
  const setup = fakeFirebase();
  const client = FirebaseAuthClient.create({ firebase: setup.firebase, config });
  assert.deepEqual(
    await client.resetPassword({ email: ' Alice@Example.com ' }),
    { resetEmailSent: true }
  );
  assert.ok(setup.calls.some((call) => (
    call[0] === 'password-reset' && call[1] === 'alice@example.com'
  )));

  setup.auth.sendPasswordResetEmail = async () => {
    throw { code: 'auth/user-not-found' };
  };
  assert.deepEqual(
    await client.resetPassword({ email: 'missing@example.com' }),
    { resetEmailSent: true }
  );
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
    client.login({ email: 'alice@example.com', password: 'wrong1' }),
    (error) => {
      assert.equal(error.message, 'メールアドレスまたはパスワードが違います。');
      assert.equal(error.code, 'auth/invalid-credential');
      assert.equal(error.message.includes('internal detail'), false);
      return true;
    }
  );
});
