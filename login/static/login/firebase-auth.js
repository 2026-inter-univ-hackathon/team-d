(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.FirebaseAuthClient = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, () => {
  const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const REQUIRED_CONFIG = ['apiKey', 'authDomain', 'projectId', 'appId'];
  const ERROR_MESSAGES = {
    'auth/email-already-in-use': 'このアカウントはすでに登録されています。',
    'auth/invalid-email': 'メールアドレスの形式が正しくありません。',
    'auth/invalid-credential': 'メールアドレスまたはパスワードが違います。',
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

  function normalizeEmail(email) {
    if (typeof email !== 'string') {
      throw new FirebaseAuthError('メールアドレスを入力してください。', 'validation/email');
    }
    const normalized = email.trim().toLowerCase();
    if (!normalized || normalized.length > 254 || !EMAIL_PATTERN.test(normalized)) {
      throw new FirebaseAuthError(
        'メールアドレスの形式が正しくありません。',
        'validation/email'
      );
    }
    return normalized;
  }

  function normalizeUsername(username) {
    if (typeof username !== 'string') {
      throw new FirebaseAuthError('ユーザー名を入力してください。', 'validation/username');
    }

    const normalized = username.trim();
    if (!normalized || normalized.length > 32 || /[\u0000-\u001f\u007f]/.test(normalized)) {
      throw new FirebaseAuthError(
        'ユーザー名は1〜32文字で入力してください。',
        'validation/username'
      );
    }
    return normalized;
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
    return {
      id: user.uid,
      email: user.email,
      username: typeof user.displayName === 'string' ? user.displayName : '',
    };
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

    async function signup({ email: inputEmail, username: inputUsername, password1, password2 }) {
      try {
        const email = normalizeEmail(inputEmail);
        const username = normalizeUsername(inputUsername);
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
        if (!credential.user || typeof credential.user.updateProfile !== 'function') {
          throw new FirebaseAuthError('ユーザープロフィールを作成できませんでした。');
        }
        await credential.user.updateProfile({ displayName: username });
        return { user: formatUser(credential.user) };
      } catch (error) {
        throw normalizeError(error);
      }
    }

    async function login({ email: inputEmail, password }) {
      try {
        const email = normalizeEmail(inputEmail);
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

  return { create, normalizeEmail, normalizeUsername, FirebaseAuthError };
});
