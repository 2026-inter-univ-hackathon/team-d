window.LoginApi = (() => {
  const TOKEN_KEY = 'sukejuru-login-token';

  // 今はローカルのDjangoへ接続。
  // 公開時はAPP_CONFIGでDjangoの公開URLを指定する。
  const API_BASE =
    window.APP_CONFIG?.apiBaseUrl || window.location.origin;

  class ApiError extends Error {
    constructor(message, status, details = {}) {
      super(message);
      this.name = 'ApiError';
      this.status = status;
      this.details = details;
    }
  }

  function saveToken(token) {
    if (typeof token !== 'string' || !token) {
      throw new Error('ログイントークンが正しくありません。');
    }

    try {
      sessionStorage.setItem(TOKEN_KEY, token);
    } catch {
      throw new Error('ログイン状態を保存できませんでした。');
    }
  }

  function getToken() {
    try {
      return sessionStorage.getItem(TOKEN_KEY);
    } catch {
      throw new Error('ログイン状態を読み込めませんでした。');
    }
  }

  function clearToken() {
    sessionStorage.removeItem(TOKEN_KEY);
  }

  function requireLogin(message) {
    clearToken();

    // 画面側で、この通知を受けてログイン画面へ移動する。
    window.dispatchEvent(new Event('auth-required'));

    throw new ApiError(message, 401);
  }

  async function request(
    path,
    { method = 'GET', data, authenticated = true } = {}
  ) {
    if (!path.startsWith('/api/')) {
      throw new Error('APIの接続先が正しくありません。');
    }

    const headers = {
      Accept: 'application/json',
    };

    if (data !== undefined) {
      headers['Content-Type'] = 'application/json';
    }

    if (authenticated) {
      const token = getToken();

      if (!token) {
        requireLogin('ログインしてください。');
      }

      headers.Authorization = `Bearer ${token}`;
    }

    let response;

    try {
      response = await fetch(new URL(path, API_BASE), {
        method,
        headers,
        body: data === undefined ? undefined : JSON.stringify(data),
        credentials: 'omit',
        cache: 'no-store',
        redirect: 'error',
        signal: AbortSignal.timeout(15000),
      });
    } catch {
      throw new ApiError(
        '通信できませんでした。接続を確認してください。',
        0
      );
    }

    if (authenticated && response.status === 401) {
      requireLogin('ログインし直してください。');
    }

    const result = await response.json().catch(() => null);

    if (!response.ok) {
      throw new ApiError(
        result?.error || '処理に失敗しました。',
        response.status,
        result || {}
      );
    }

    if (result === null) {
      throw new ApiError(
        'サーバーからの応答を読み込めませんでした。',
        response.status
      );
    }

    return result;
  }

  return { request, saveToken, getToken, clearToken };
})();
