(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.FirebaseAuthClient = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, () => {
  const USERNAME_PATTERN = /^[a-z0-9][a-z0-9._-]{0,31}$/;
  const REQUIRED_CONFIG = ['apiKey', 'authDomain', 'projectId', 'appId'];
  const ERROR_MESSAGES = {
    'auth/email-already-in-use': 'このアカウントはすでに登録されています。',
    'auth/invalid-credential': 'ユーザー名またはパスワードが違います。',
    'auth/user-disabled': 'このアカウントは利用できません。',
    'auth/weak-password': 'パスワードは6文字以上で入力してください。',
    'auth/too-many-requests': '試行回数が多すぎます。しばらく待ってください。',
    'auth/network-request-failed': '通信できませんでした。接続を確認してください。',
  };

  class FirebaseAuthError extends Error {
    constructor(message, code = 'auth/unknown') {
      super(message);
      this.name = 'FirebaseAuthError';
      this.code = code;
    }
  }

  function accountEmail(username) {
    if (typeof username !== 'string') {
      throw new FirebaseAuthError('ユーザー名を入力してください。', 'validation/username');
    }

    const normalized = username.trim().toLowerCase();
    if (!USERNAME_PATTERN.test(normalized)) {
      throw new FirebaseAuthError(
        'ユーザー名は半角小文字・数字・「.」「-」「_」で入力してください。',
        'validation/username'
      );
    }
    return `${normalized}@example.com`;
  }

  function validateConfig(config) {
    if (!config || REQUIRED_CONFIG.some((key) => (
      typeof config[key] !== 'string' || !config[key].trim()
    ))) {
      throw new FirebaseAuthError(
        'Firebaseの接続設定が完了していません。',
        'config/incomplete'
      );
    }
  }

  function formatUser(user) {
    if (!user || typeof user.uid !== 'string' || typeof user.email !== 'string') {
      throw new FirebaseAuthError('ログイン情報を読み込めませんでした。');
    }
    return { id: user.uid, email: user.email };
  }

  function normalizeError(error) {
    if (error instanceof FirebaseAuthError) return error;
    const code = typeof error?.code === 'string' ? error.code : 'auth/unknown';
    return new FirebaseAuthError(
      ERROR_MESSAGES[code] || '認証処理に失敗しました。',
      code
    );
  }

  function create({ firebase, config }) {
    validateConfig(config);
    if (!firebase || typeof firebase.initializeApp !== 'function') {
      throw new FirebaseAuthError(
        'Firebase Authenticationを読み込めませんでした。',
        'config/sdk-missing'
      );
    }

    const app = firebase.apps?.length ? firebase.app() : firebase.initializeApp(config);
    const auth = app.auth();
    const sessionPersistence = firebase.auth?.Auth?.Persistence?.SESSION;
    if (!sessionPersistence || typeof auth.setPersistence !== 'function') {
      throw new FirebaseAuthError(
        'Firebase Authenticationを初期化できませんでした。',
        'config/auth-missing'
      );
    }

    const ready = Promise.resolve(auth.setPersistence(sessionPersistence)).catch((error) => {
      throw normalizeError(error);
    });

    async function signup({ username, password1, password2 }) {
      try {
        const email = accountEmail(username);
        if (typeof password1 !== 'string' || password1.length < 6) {
          throw new FirebaseAuthError(
            'パスワードは6文字以上で入力してください。',
            'validation/password'
          );
        }
        if (password1 !== password2) {
          throw new FirebaseAuthError(
            '確認用パスワードが一致しません。',
            'validation/password-confirmation'
          );
        }

        await ready;
        const credential = await auth.createUserWithEmailAndPassword(email, password1);
        return { user: formatUser(credential.user) };
      } catch (error) {
        throw normalizeError(error);
      }
    }

    async function login({ username, password }) {
      try {
        const email = accountEmail(username);
        if (typeof password !== 'string' || !password) {
          throw new FirebaseAuthError(
            'パスワードを入力してください。',
            'validation/password'
          );
        }

        await ready;
        const credential = await auth.signInWithEmailAndPassword(email, password);
        return { user: formatUser(credential.user) };
      } catch (error) {
        throw normalizeError(error);
      }
    }

    async function logout() {
      try {
        await ready;
        await auth.signOut();
      } catch (error) {
        throw normalizeError(error);
      }
    }

    async function currentUser() {
      try {
        await ready;
        return await new Promise((resolve, reject) => {
          let unsubscribe;
          const finish = (user) => {
            if (unsubscribe) unsubscribe();
            resolve(user ? formatUser(user) : null);
          };
          unsubscribe = auth.onAuthStateChanged(finish, reject);
        });
      } catch (error) {
        throw normalizeError(error);
      }
    }

    return { signup, login, logout, currentUser, auth };
  }

  return { create, accountEmail, FirebaseAuthError };
});
