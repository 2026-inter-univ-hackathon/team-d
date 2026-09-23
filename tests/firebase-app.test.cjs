const test = require('node:test');
const assert = require('node:assert/strict');

const FirebaseAppClient = require('../static/firebase-app.js');

const config = {
  apiKey: 'public-key',
  authDomain: 'demo.firebaseapp.com',
  projectId: 'demo',
  appId: 'web-app-id',
};
const appCheckConfig = { siteKey: 'site-key' };

function fakeFirebase() {
  const calls = [];
  const apps = [];
  const app = { name: 'default' };
  const appCheckInstance = {
    activate(provider, autoRefresh) {
      calls.push(['activate', provider.siteKey, autoRefresh]);
    },
  };
  function appCheck(receivedApp) {
    calls.push(['app-check', receivedApp]);
    return appCheckInstance;
  }
  appCheck.ReCaptchaEnterpriseProvider = class {
    constructor(siteKey) {
      this.siteKey = siteKey;
      calls.push(['provider', siteKey]);
    }
  };
  return {
    calls,
    firebase: {
      apps,
      initializeApp(receivedConfig) {
        calls.push(['initialize', receivedConfig]);
        apps.push(app);
        return app;
      },
      app() { return app; },
      appCheck,
    },
  };
}

test('initializes App Check with automatic token refresh', () => {
  const setup = fakeFirebase();
  const globalObject = {};

  const app = FirebaseAppClient.initialize({
    firebase: setup.firebase,
    config,
    appCheckConfig,
    hostname: '2026-inter-univ-hackathon.github.io',
    globalObject,
  });

  assert.equal(app.name, 'default');
  assert.deepEqual(setup.calls[0], ['initialize', config]);
  assert.deepEqual(setup.calls.at(-1), ['activate', 'site-key', true]);
  assert.equal(globalObject.FIREBASE_APPCHECK_DEBUG_TOKEN, undefined);
});

test('enables the debug provider only for local development', () => {
  for (const hostname of ['localhost', '127.0.0.1']) {
    const setup = fakeFirebase();
    const globalObject = {};
    FirebaseAppClient.initialize({
      firebase: setup.firebase, config, appCheckConfig, hostname, globalObject,
    });
    assert.equal(globalObject.FIREBASE_APPCHECK_DEBUG_TOKEN, true);
  }
  assert.equal(FirebaseAppClient.isLocalHostname('HikaruSuna.github.io'), false);
});

test('activates App Check only once for the same Firebase app', () => {
  const setup = fakeFirebase();
  const options = {
    firebase: setup.firebase,
    config,
    appCheckConfig,
    hostname: 'example.com',
    globalObject: {},
  };
  FirebaseAppClient.initialize(options);
  FirebaseAppClient.initialize(options);
  assert.equal(setup.calls.filter((call) => call[0] === 'activate').length, 1);
});

test('rejects incomplete configuration and a missing App Check SDK', () => {
  const setup = fakeFirebase();
  assert.throws(
    () => FirebaseAppClient.initialize({
      firebase: setup.firebase, config, appCheckConfig: { siteKey: '' }, hostname: 'example.com',
    }),
    /サイトキー/
  );
  assert.throws(
    () => FirebaseAppClient.initialize({
      firebase: { apps: [], initializeApp() {} }, config, appCheckConfig, hostname: 'example.com',
    }),
    /App Check SDK/
  );
});
