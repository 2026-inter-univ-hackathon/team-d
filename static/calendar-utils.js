// ============================================================
// 共通ユーティリティ（Helper Functions）
// ============================================================
function uid() {
  return 'ev_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

function dateStr(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function todayStr() {
  return dateStr(new Date());
}

function escapeHtml(str) {
  return String(str || '').replace(/[&<>"']/g, m => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[m]));
}

function timeToHours(timeStr) {
  if (!timeStr) return 0;
  const parts = timeStr.split(':');
  const h = parseInt(parts[0], 10) || 0;
  const m = parseInt(parts[1], 10) || 0;
  return h + m / 60;
}

function hoursToTime(hours) {
  let totalMin = Math.round(hours * 60);
  totalMin = Math.round(totalMin / 15) * 15;
  let h = Math.floor(totalMin / 60);
  let m = totalMin % 60;
  if (h >= 24) {
    h = 23;
    m = 45;
  }
  return `${pad2(h)}:${pad2(m)}`;
}

function calcEndTime(startTimeStr, durationHours) {
  if (!startTimeStr) return '';
  const start = timeToHours(startTimeStr);
  const end = Math.min(24, start + (durationHours || 1));
  let totalMin = Math.round(end * 60);
  totalMin = Math.round(totalMin / 15) * 15;
  const endH = Math.floor(totalMin / 60);
  const endM = totalMin % 60;
  return `${pad2(endH)}:${pad2(endM)}`;
}

function getTimeOptionsHtml(selectedVal = '') {
  let html = '<option value="">指定なし（終日）</option>';
  let found = false;
  for (let totalMin = 0; totalMin < 24 * 60; totalMin += 15) {
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    const t = `${pad2(h)}:${pad2(m)}`;
    const sel = t === selectedVal ? ' selected' : '';
    if (sel) found = true;
    html += `<option value="${t}"${sel}>${t}</option>`;
  }
  if (selectedVal && !found) {
    html += `<option value="${selectedVal}" selected>${selectedVal}</option>`;
  }
  return html;
}

function getEndTimeOptionsHtml(selectedVal = '') {
  let html = '<option value="">未定（指定なし）</option>';
  let found = false;
  for (let totalMin = 15; totalMin <= 24 * 60; totalMin += 15) {
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    const t = `${pad2(h)}:${pad2(m)}`;
    const sel = t === selectedVal ? ' selected' : '';
    if (sel) found = true;
    html += `<option value="${t}"${sel}>${t}</option>`;
  }
  if (selectedVal && !found) {
    html += `<option value="${selectedVal}" selected>${selectedVal}</option>`;
  }
  return html;
}

// 開始時刻・終了時刻の双方向連動ヘルパー
function bindTimeAndDuration(timeEl, endTimeEl, onUpdate) {
  if (!timeEl || !endTimeEl) return;

  timeEl.addEventListener('change', () => {
    const startVal = timeEl.value;
    if (!startVal) {
      endTimeEl.value = '';
    } else if (endTimeEl.value) {
      const startHours = timeToHours(startVal);
      const endHours = timeToHours(endTimeEl.value);
      if (endHours <= startHours) {
        endTimeEl.value = calcEndTime(startVal, 1);
      }
    }
    if (typeof onUpdate === 'function') onUpdate();
  });

  endTimeEl.addEventListener('change', () => {
    const endVal = endTimeEl.value;
    if (endVal) {
      const endHours = timeToHours(endVal);
      if (!timeEl.value) {
        const startHours = Math.max(0, endHours - 1);
        timeEl.value = hoursToTime(startHours);
      } else {
        const startHours = timeToHours(timeEl.value);
        if (endHours <= startHours) {
          endTimeEl.value = calcEndTime(timeEl.value, 1);
        }
      }
    }
    if (typeof onUpdate === 'function') onUpdate();
  });
}

// ============================================================
// フィードバックメッセージ表示
// ============================================================
function showFeedback(msg, err = false) {
  const id = err ? "toast-error" : "toast";
  const toastEl = document.getElementById(id);
  if (!toastEl) return;
  toastEl.textContent = msg;
  if (typeof ui === 'function') {
    ui(`#${id}`);
  }
}

// ============================================================
// お気に入り機能（Favorites）
// ============================================================
const FAVORITES_KEY = 'tentative_calendar_favorites';
const DEFAULT_FAVORITES = [
  { id: 'fav_1', title: 'ゼミ・研究会', duration: 2, memo: '', time: '13:00' },
  { id: 'fav_2', title: 'アルバイト', duration: 4, memo: '', time: '17:00' },
  { id: 'fav_3', title: '課題・レポート', duration: 1, memo: '', time: '' },
  { id: 'fav_4', title: '定例ミーティング', duration: 1, memo: '', time: '10:00' }
];

function loadFavorites() {
  try {
    const raw = localStorage.getItem(FAVORITES_KEY);
    if (raw === null) {
      localStorage.setItem(FAVORITES_KEY, JSON.stringify(DEFAULT_FAVORITES));
      return [...DEFAULT_FAVORITES];
    }
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function saveFavorites(favs) {
  localStorage.setItem(FAVORITES_KEY, JSON.stringify(favs));
}

function renderFavorites() {
  const favoritesListEl = document.getElementById('favorites-list');
  if (!favoritesListEl) return;
  const favs = loadFavorites();
  favoritesListEl.innerHTML = '';
  if (favs.length === 0) {
    const empty = document.createElement('span');
    empty.className = 'muted';
    empty.style.fontSize = '.8rem';
    empty.textContent = 'お気に入りはまだありません（予定詳細の「お気に入り保存」で追加できます）';
    favoritesListEl.appendChild(empty);
    return;
  }

  favs.forEach(fav => {
    const chip = document.createElement('button');
    chip.className = 'chip';
    const info = [];
    if (fav.time) info.push(fav.time);
    if (fav.duration) info.push(`${fav.duration}時間`);
    const infoText = info.length > 0 ? ` [${info.join(', ')}]` : '';
    const tooltip = document.createElement("span");
    tooltip.className = 'tooltip bottom';
    tooltip.innerHTML = `${fav.title}${infoText}${fav.memo ? '<br>' + fav.memo : ''}<br>クリックで入力欄に反映`;
    chip.appendChild(tooltip);

    const titleSpan = document.createElement('span');
    titleSpan.textContent = fav.title;
    chip.appendChild(titleSpan);

    const removeBtn = document.createElement('a');
    removeBtn.className = 'link';
    removeBtn.style.fontSize = '20px';
    removeBtn.innerHTML = '<i>close</i>';
    removeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!confirm(`「${fav.title}」をお気に入りから削除してもよろしいですか？`)) {
        return;
      }
      const currentFavs = loadFavorites().filter(f => f.id !== fav.id);
      saveFavorites(currentFavs);
      renderFavorites();
      showFeedback(`「${fav.title}」をお気に入りから削除しました`);
    });
    chip.appendChild(removeBtn);

    chip.addEventListener('click', () => {
      applyFavorite(fav, chip);
    });

    favoritesListEl.appendChild(chip);
  });
}

function applyFavorite(fav, chipEl) {
  const input = document.getElementById('new-title');
  if (!input) return;
  input.value = fav.title;
  input.focus();

  if (chipEl) {
    chipEl.classList.remove('applied');
    void chipEl.offsetWidth;
    chipEl.classList.add('applied');
  }

  showFeedback(`「${fav.title}」を入力欄に反映しました`);
}

// ============================================================
// 直近の登録履歴（History）
// ============================================================
const HISTORY_KEY = 'tentative_calendar_history';
const MAX_HISTORY = 8;

function loadHistory() {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    let list = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(list)) list = [];
    if (list.length === 0 && typeof loadEvents === 'function') {
      const events = loadEvents();
      const seen = new Set();
      events.slice().reverse().forEach(ev => {
        if (ev.title && !seen.has(ev.title)) {
          seen.add(ev.title);
          list.push({
            title: ev.title,
            memo: ev.memo || '',
            duration: ev.duration || 1,
            time: ev.time || ''
          });
        }
      });
      list = list.slice(0, MAX_HISTORY);
    }
    return list;
  } catch {
    return [];
  }
}

function recordHistory(title, memo = '', duration = 1, time = '') {
  const cleanTitle = (title || '').trim();
  if (!cleanTitle) return;
  let list = loadHistory();
  list = list.filter(item => item.title !== cleanTitle);
  list.unshift({
    title: cleanTitle,
    memo: memo || '',
    duration: duration || 1,
    time: time || ''
  });
  list = list.slice(0, MAX_HISTORY);
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(list));
  } catch { }
}

function renderHistoryDropdown(query = '') {
  const historyDropdown = document.getElementById('history-dropdown');
  if (!historyDropdown) return;
  const allHistory = loadHistory();
  const filtered = query.trim()
    ? allHistory.filter(h => h.title.toLowerCase().includes(query.trim().toLowerCase()))
    : allHistory;

  historyDropdown.innerHTML = '';
  if (filtered.length === 0) {
    historyDropdown.style.display = 'none';
    return;
  }

  filtered.forEach(item => {
    const row = document.createElement('nav');
    row.classList.add("history-item", "no-margin");

    const historyIcon = document.createElement('i');
    historyIcon.textContent = 'history';
    row.appendChild(historyIcon);

    const titleDiv = document.createElement('p');
    titleDiv.classList.add("max", "large-text");
    titleDiv.textContent = item.title;
    row.appendChild(titleDiv);

    const metaSpan = document.createElement('span');
    metaSpan.className = 'history-meta';
    const metaInfo = [];
    if (item.time) metaInfo.push(item.time);
    if (item.duration) metaInfo.push(`${item.duration}時間`);
    metaSpan.textContent = metaInfo.join(', ');
    row.appendChild(metaSpan);

    row.addEventListener('click', (e) => {
      e.stopPropagation();
      applyHistoryItem(item);
      historyDropdown.style.display = 'none';
    });

    historyDropdown.appendChild(row);
  });

  historyDropdown.style.display = 'block';
}

function applyHistoryItem(item) {
  const newTitleInput = document.getElementById('new-title');
  if (!newTitleInput) return;
  newTitleInput.value = item.title;
  newTitleInput.focus();
}

// 履歴用リスナー設定
document.addEventListener('DOMContentLoaded', () => {
  const newTitleInput = document.getElementById('new-title');
  const historyDropdown = document.getElementById('history-dropdown');
  if (!newTitleInput || !historyDropdown) return;

  newTitleInput.addEventListener('focus', () => {
    renderHistoryDropdown(newTitleInput.value);
  });

  newTitleInput.addEventListener("focusout", () => {
    setTimeout(() => {
      historyDropdown.style.display = "none";
    }, 200);
  });

  newTitleInput.addEventListener('click', (e) => {
    e.stopPropagation();
    renderHistoryDropdown(newTitleInput.value);
  });

  newTitleInput.addEventListener('input', () => {
    renderHistoryDropdown(newTitleInput.value);
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.input-history-wrapper')) {
      historyDropdown.hidden = true;
      historyDropdown.style.display = 'none';
    }
  });

  newTitleInput.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      historyDropdown.hidden = true;
      historyDropdown.style.display = 'none';
    }
  });
});
