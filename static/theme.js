// ============================================================
// アプリのテーマ管理（ライト / ダーク / 自動）
// ============================================================
const THEME_KEY = 'taschedule_theme';

function getSavedTheme() {
  return localStorage.getItem(THEME_KEY) || 'auto';
}

function applyTheme(theme) {
  localStorage.setItem(THEME_KEY, theme);

  let isDark = false;
  if (theme === 'dark') {
    isDark = true;
  } else if (theme === 'light') {
    isDark = false;
  } else {
    // 'auto'
    isDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  }

  if (isDark) {
    document.body.classList.remove('light');
    document.body.classList.add('dark');
  } else {
    document.body.classList.remove('dark');
    document.body.classList.add('light');
  }
  if (typeof ui === 'function') {
    try {
      ui('mode', isDark ? 'dark' : 'light');
    } catch (e) {
      // Beer CSS might not be ready yet
    }
  }

  const labelEl = document.getElementById('current-theme-label');
  if (labelEl) {
    if (theme === 'auto') labelEl.textContent = '自動';
    else if (theme === 'light') labelEl.textContent = 'ライト';
    else if (theme === 'dark') labelEl.textContent = 'ダーク';
  }

  ['auto', 'light', 'dark'].forEach(t => {
    const item = document.getElementById(`theme-${t}`);
    if (item) {
      item.className = t === theme ? 'active' : '';
    }
  });
}

// 初回即時反映
applyTheme(getSavedTheme());

function initTheme() {
  ['auto', 'light', 'dark'].forEach(t => {
    const item = document.getElementById(`theme-${t}`);
    if (item) {
      item.addEventListener('click', () => {
        applyTheme(t);
      });
    }
  });

  if (window.matchMedia) {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      if (getSavedTheme() === 'auto') {
        applyTheme('auto');
      }
    });
  }

  applyTheme(getSavedTheme());
}
