// ============================================================
// データの保存と読み込み（Firebase Authentication / Firestore）
// およびアプリケーション初期化
// ============================================================
let syncMessage;
let calendarContent;
let reloadButton;
let currentUser;
let logoutButton;
const loginUrl = window.APP_CONFIG?.loginUrl || '/login/';
let loading = false;

async function apiRequest(url, method = 'GET', data) {
  return LoginApi.request(url, { method, data });
}

window.addEventListener('auth-required', () => {
  window.location.assign(loginUrl);
});

const store = new CalendarStore(apiRequest);

function loadEvents() {
  return store.load();
}

function setSync(message, error = false) {
  if (syncMessage) {
    syncMessage.textContent = message;
    syncMessage.style.color = error ? 'var(--error, #ba1a1a)' : 'inherit';
  }
  if (typeof showFeedback === 'function' && message) {
    showFeedback(message, error);
  }
}

function lockCalendar(locked) {
  if (calendarContent) {
    calendarContent.inert = locked;
    calendarContent.setAttribute('aria-busy', String(locked));
  }
  if (reloadButton) reloadButton.disabled = locked;
  const ip = document.getElementById('import-panel');
  if (ip) ip.inert = locked;
}

async function saveEvents(events) {
  if (store.busy || loading || !store.ready) return false;
  lockCalendar(true);
  setSync('保存しています…');
  try {
    await store.save(events);
    setSync('同期完了');
    return true;
  } catch (error) {
    setSync(error.message, true);
    return false;
  } finally {
    lockCalendar(false);
  }
}

async function refreshEvents() {
  if (loading) return;
  loading = true;
  lockCalendar(true);
  setSync('予定を読み込んでいます…');
  try {
    await store.refresh();
    if (typeof renderAll === 'function') renderAll();
    setSync('同期完了');
  } catch (error) {
    setSync(error.message, true);
    throw error;
  } finally {
    loading = false;
    lockCalendar(false);
  }
}

async function initializeApp() {
  try {
    const result = await LoginApi.request('/api/auth/me/');
    if (currentUser) {
      currentUser.textContent = result.user.username
        ? `${result.user.username}（${result.user.email}）`
        : result.user.email;
    }
    if (typeof setUserEmail === 'function' && result.user?.email) {
      setUserEmail(result.user.email);
    }
    await refreshEvents();
    if (calendarContent) calendarContent.hidden = false;
    if (typeof checkEmailReminders === 'function') await checkEmailReminders();
  } catch (error) {
    if (error.status !== 401) setSync(error.message, true);
  }
}

function initMainElements() {
  syncMessage = document.getElementById('sync-message');
  calendarContent = document.getElementById('calendar-content');
  reloadButton = document.getElementById('reload-events');
  currentUser = document.getElementById('current-user');
  logoutButton = document.getElementById('logout-btn');

  if (logoutButton) {
    logoutButton.addEventListener('click', async () => {
      if (store.busy || loading) return;
      logoutButton.disabled = true;
      setSync('ログアウトしています…');
      try {
        await LoginApi.request('/api/auth/logout/', { method: 'POST' });
        window.location.assign(loginUrl);
      } catch (error) {
        if (error.status !== 401) {
          setSync(error.message, true);
          logoutButton.disabled = false;
        }
      }
    });
  }

  if (reloadButton) {
    reloadButton.addEventListener('click', async () => {
      try {
        await refreshEvents();
        if (typeof checkEmailReminders === 'function') checkEmailReminders();
      } catch (error) {
        // error handling and toast already handled in setSync
      }
    });
  }
}

// ============================================================
// アプリ初期化実行
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
  initMainElements();
  if (typeof initTheme === 'function') initTheme();
  if (typeof renderFavorites === 'function') renderFavorites();
  if (typeof updateEmailNotificationUI === 'function') updateEmailNotificationUI();
  initializeApp();
  window.addEventListener('pageshow', event => {
    if (event.persisted) window.location.reload();
  });
});
