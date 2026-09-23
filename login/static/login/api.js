window.LoginApi = (() => {
  class ApiError extends Error {
    constructor(message, status = 400) {
      super(message);
      this.name = 'ApiError';
      this.status = status;
    }
  }

  let clients;

  function initializeClients() {
    if (clients) return clients;
    if (!window.FirebaseAuthClient || !window.FirebaseEventsClient) {
      throw new ApiError('Firebaseの接続プログラムを読み込めませんでした。', 0);
    }

    const authClient = window.FirebaseAuthClient.create({
      firebase: window.firebase,
      config: window.FIREBASE_CONFIG,
    });
    const eventsClient = window.FirebaseEventsClient.create({
      firebase: window.firebase,
      auth: authClient.auth,
      db: window.firebase.firestore(),
    });
    clients = { authClient, eventsClient };
    return clients;
  }

  function requireLogin(message = 'ログインしてください。') {
    window.dispatchEvent(new Event('auth-required'));
    throw new ApiError(message, 401);
  }

  async function signedInClients() {
    const initialized = initializeClients();
    const user = await initialized.authClient.currentUser();
    if (!user) requireLogin();
    return { ...initialized, user };
  }

  async function request(path, { method = 'GET', data } = {}) {
    if (typeof path !== 'string' || !path.startsWith('/api/')) {
      throw new ApiError('APIの接続先が正しくありません。');
    }

    const normalizedMethod = String(method).toUpperCase();
    const initialized = initializeClients();

    if (path === '/api/auth/signup/' && normalizedMethod === 'POST') {
      return initialized.authClient.signup(data);
    }
    if (path === '/api/auth/login/' && normalizedMethod === 'POST') {
      return initialized.authClient.login(data);
    }
    if (path === '/api/auth/logout/' && normalizedMethod === 'POST') {
      await initialized.authClient.logout();
      return { loggedOut: true };
    }
    if (path === '/api/auth/password-reset/' && normalizedMethod === 'POST') {
      return initialized.authClient.resetPassword(data);
    }
    if (path === '/api/auth/me/' && normalizedMethod === 'GET') {
      const user = await initialized.authClient.currentUser();
      if (!user) requireLogin();
      return { user };
    }

    const { eventsClient } = await signedInClients();
    if (path === '/api/events/' && normalizedMethod === 'GET') {
      return { events: await eventsClient.list() };
    }
    if (path === '/api/events/' && normalizedMethod === 'POST') {
      return { event: await eventsClient.create(data) };
    }
    if (path === '/api/events/import/' && normalizedMethod === 'POST') {
      return eventsClient.import(data?.events);
    }

    const match = path.match(/^\/api\/events\/([^/]+)\/$/);
    if (match && normalizedMethod === 'PATCH') {
      const { version, ...changes } = data || {};
      return { event: await eventsClient.update(match[1], changes, version) };
    }
    if (match && normalizedMethod === 'DELETE') {
      return eventsClient.delete(match[1], data?.version);
    }

    throw new ApiError('APIの操作が正しくありません。', 404);
  }

  return { request };
})();
