(function (root, factory) {
  const api = factory(root);
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.FirebaseAppClient = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, (root) => {
  const REQUIRED_FIREBASE_CONFIG = ['apiKey', 'authDomain', 'projectId', 'appId'];
  const activatedApps = new WeakSet();

  class FirebaseAppError extends Error {
    constructor(message, code = 'app/unknown') {
      super(message);
      this.name = 'FirebaseAppError';
      this.code = code;
    }
  }

  function validateConfig(config, appCheckConfig) {
    if (!config || REQUIRED_FIREBASE_CONFIG.some((key) => (
      typeof config[key] !== 'string' || !config[key].trim()
    ))) {
      throw new FirebaseAppError(
        'Firebaseの接続設定が完了していません。',
        'config/firebase-incomplete'
      );
    }
    if (typeof appCheckConfig?.siteKey !== 'string' || !appCheckConfig.siteKey.trim()) {
      throw new FirebaseAppError(
        'Firebase App Checkのサイトキーが設定されていません。',
        'config/app-check-incomplete'
      );
    }
  }

  function isLocalHostname(hostname) {
    return hostname === 'localhost' || hostname === '127.0.0.1';
  }

  function initialize({ firebase, config, appCheckConfig, hostname, globalObject = root }) {
    validateConfig(config, appCheckConfig);
    if (!firebase || typeof firebase.initializeApp !== 'function') {
      throw new FirebaseAppError(
        'Firebase SDKを読み込めませんでした。',
        'config/firebase-sdk-missing'
      );
    }
    if (
      typeof firebase.appCheck !== 'function'
      || typeof firebase.appCheck.ReCaptchaEnterpriseProvider !== 'function'
    ) {
      throw new FirebaseAppError(
        'Firebase App Check SDKを読み込めませんでした。',
        'config/app-check-sdk-missing'
      );
    }

    const resolvedHostname = typeof hostname === 'string'
      ? hostname
      : globalObject.location?.hostname || '';
    if (isLocalHostname(resolvedHostname)) {
      globalObject.FIREBASE_APPCHECK_DEBUG_TOKEN = true;
    }

    const app = firebase.apps?.length ? firebase.app() : firebase.initializeApp(config);
    if (!activatedApps.has(app)) {
      const provider = new firebase.appCheck.ReCaptchaEnterpriseProvider(
        appCheckConfig.siteKey.trim()
      );
      firebase.appCheck(app).activate(provider, true);
      activatedApps.add(app);
    }
    return app;
  }

  return { FirebaseAppError, initialize, isLocalHostname, validateConfig };
});
