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
  const dur = durationHours || 1;
  const total = start + dur;
  const days = Math.floor(total / 24);
  const rem = total % 24;
  let totalMin = Math.round(rem * 60);
  totalMin = Math.round(totalMin / 15) * 15;
  let endH = Math.floor(totalMin / 60);
  let endM = totalMin % 60;
  if (endH >= 24) {
    endH = 0;
  }
  const timeStr = `${pad2(endH)}:${pad2(endM)}`;
  if (days === 0) return timeStr;
  if (days === 1) return `翌日 ${timeStr}`;
  return `+${days}日 ${timeStr}`;
}

function calcEndDate(startDateStr, startTimeStr, durationHours) {
  if (!startDateStr) return null;
  const startHours = startTimeStr ? timeToHours(startTimeStr) : 0;
  const dur = durationHours || 1;
  const totalHours = startHours + dur;
  const days = startTimeStr
    ? Math.floor((totalHours - 0.001) / 24)
    : Math.max(0, Math.ceil(dur / 24) - 1);
  const d = new Date(startDateStr + 'T00:00:00');
  d.setDate(d.getDate() + Math.max(0, days));
  return dateStr(d);
}

function getEventDateRange(ev) {
  if (!ev || !ev.date) return null;
  const startDate = ev.date;
  const dur = ev.duration || 1;
  const endDate = calcEndDate(startDate, ev.time, dur);
  return { startDate, endDate };
}

function isEventOnDate(ev, targetDateStr) {
  if (!ev || !ev.date) return false;
  if (ev.date === targetDateStr) return true;
  const range = getEventDateRange(ev);
  if (!range) return false;
  return targetDateStr >= range.startDate && targetDateStr <= range.endDate;
}

function formatDuration(durationHours) {
  const dur = durationHours || 1;
  if (dur < 24) {
    return `${dur}時間`;
  }
  const days = Math.floor(dur / 24);
  const remHours = dur % 24;
  if (remHours === 0) {
    return `${dur}時間 (${days}日間)`;
  }
  return `${dur}時間 (${days}日+${remHours}時間)`;
}

function parseEndTime(endTimeStr) {
  if (!endTimeStr) return null;
  const matchPlus = endTimeStr.match(/^\+(\d+)日\s*(\d{2}):(\d{2})$/);
  if (matchPlus) {
    const days = parseInt(matchPlus[1], 10);
    const h = parseInt(matchPlus[2], 10);
    const m = parseInt(matchPlus[3], 10);
    return days * 24 + h + m / 60;
  }
  const matchNext = endTimeStr.match(/^翌日\s*(\d{2}):(\d{2})$/);
  if (matchNext) {
    const h = parseInt(matchNext[1], 10);
    const m = parseInt(matchNext[2], 10);
    return 24 + h + m / 60;
  }
  return timeToHours(endTimeStr);
}

function calcDurationFromTimes(startTimeStr, endTimeStr) {
  if (!startTimeStr || !endTimeStr) return null;
  const start = timeToHours(startTimeStr);
  let end = parseEndTime(endTimeStr);
  if (end === null) return null;
  // もし開始時刻が 22:00 で終了が 02:00 のように指定された場合、翌日 02:00（日付またぎ）として計算
  if (!endTimeStr.includes('翌日') && !endTimeStr.includes('+') && end <= start) {
    end += 24;
  }
  return Math.max(0.25, end - start);
}

function calcDurationFromDatesAndTimes(startDateStr, startTimeStr, endDateStr, endTimeStr) {
  if (!startDateStr) return 1;
  const effectiveEndDateStr = endDateStr || startDateStr;
  const startD = new Date(startDateStr + 'T00:00:00');
  const endD = new Date(effectiveEndDateStr + 'T00:00:00');
  const daysDiff = Math.max(0, Math.round((endD - startD) / (24 * 60 * 60 * 1000)));

  if (!startTimeStr && !endTimeStr) {
    return Math.max(1, (daysDiff + 1) * 24);
  }

  const startHours = startTimeStr ? timeToHours(startTimeStr) : 0;
  let endHours = 0;
  if (endTimeStr) {
    endHours = timeToHours(endTimeStr) || 24;
  } else {
    endHours = startTimeStr ? (startHours + 1) : 24;
  }

  const total = daysDiff * 24 + endHours - startHours;
  return Math.max(1, Math.round(total));
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

  html += '<optgroup label="当日">';
  for (let totalMin = 15; totalMin <= 24 * 60; totalMin += 15) {
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    const t = `${pad2(h)}:${pad2(m)}`;
    const sel = t === selectedVal ? ' selected' : '';
    if (sel) found = true;
    html += `<option value="${t}"${sel}>${t}</option>`;
  }
  html += '</optgroup>';

  html += '<optgroup label="翌日（日付またぎ）">';
  for (let totalMin = 0; totalMin <= 24 * 60; totalMin += 30) {
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    const t = `翌日 ${pad2(h)}:${pad2(m)}`;
    const sel = t === selectedVal ? ' selected' : '';
    if (sel) found = true;
    html += `<option value="${t}"${sel}>${t}</option>`;
  }
  html += '</optgroup>';

  if (selectedVal && !found) {
    html += `<option value="${selectedVal}" selected>${selectedVal}</option>`;
  }
  return html;
}

// 開始時刻・終了時刻・所要時間の双方向連動ヘルパー
function bindTimeAndDuration(timeEl, endTimeEl, durationEl, onUpdate) {
  if (typeof durationEl === 'function') {
    onUpdate = durationEl;
    durationEl = null;
  }
  if (!timeEl || !endTimeEl) return;

  timeEl.addEventListener('change', () => {
    const startVal = timeEl.value;
    if (!startVal) {
      endTimeEl.value = '';
      if (durationEl && !durationEl.value) durationEl.value = '1';
    } else {
      const dur = durationEl && parseInt(durationEl.value, 10) ? parseInt(durationEl.value, 10) : 1;
      endTimeEl.value = calcEndTime(startVal, dur);
    }
    if (typeof onUpdate === 'function') onUpdate();
  });

  endTimeEl.addEventListener('change', () => {
    const endVal = endTimeEl.value;
    if (endVal) {
      if (!timeEl.value) {
        timeEl.value = '09:00';
      }
      const dur = calcDurationFromTimes(timeEl.value, endVal);
      if (dur !== null) {
        if (durationEl) durationEl.value = String(Math.round(dur));
      }
    }
    if (typeof onUpdate === 'function') onUpdate();
  });

  if (durationEl) {
    durationEl.addEventListener('input', () => {
      const durVal = parseInt(durationEl.value, 10);
      if (durVal && durVal >= 1 && timeEl.value) {
        endTimeEl.value = calcEndTime(timeEl.value, durVal);
      }
      if (typeof onUpdate === 'function') onUpdate();
    });
  }
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
    tooltip.innerHTML = `${fav.title}${infoText}${fav.memo ? '<br>' + fav.memo : ''}<br>クリックでトレイに追加`;
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

async function addEventToTray({ title, memo = '', duration = 1, time = null, status = 'TENTATIVE' }) {
  const cleanTitle = (title || '').trim();
  if (!cleanTitle) return;
  const events = typeof loadEvents === 'function' ? loadEvents() : [];
  events.push({
    id: typeof uid === 'function' ? uid() : String(Date.now()),
    title: cleanTitle,
    memo: memo || '',
    status: status || 'TENTATIVE',
    date: null,
    time: time || null,
    duration: duration || 1,
    createdAt: Date.now(),
    remindedOn: null,
  });
  if (typeof saveEvents === 'function') {
    if (!await saveEvents(events)) return;
  }
  if (typeof recordHistory === 'function') {
    recordHistory(cleanTitle, memo, duration, time || '');
  }
  if (typeof renderAll === 'function') {
    renderAll();
  }
}

async function applyFavorite(fav, chipEl) {
  await addEventToTray({
    title: fav.title,
    memo: fav.memo || '',
    duration: fav.duration || 1,
    time: fav.time || null,
  });

  if (chipEl) {
    chipEl.classList.remove('applied');
    void chipEl.offsetWidth;
    chipEl.classList.add('applied');
  }

  showFeedback(`「${fav.title}」をトレイに追加しました`);
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

function hideHistoryDropdown() {
  const historyDropdown = document.getElementById('history-dropdown');
  if (historyDropdown) {
    historyDropdown.style.display = 'none';
  }
}

function showHistoryDropdown() {
  const historyDropdown = document.getElementById('history-dropdown');
  if (historyDropdown) {
    historyDropdown.style.display = 'block';
  }
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
    hideHistoryDropdown();
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

    // Prevent input blur before click event fires
    row.addEventListener('mousedown', (e) => {
      e.preventDefault();
    });

    const handleSelect = (e) => {
      e.preventDefault();
      e.stopPropagation();
      applyHistoryItem(item);
      hideHistoryDropdown();
    };

    row.addEventListener('click', handleSelect);

    historyDropdown.appendChild(row);
  });

  showHistoryDropdown();
}

async function applyHistoryItem(item) {
  const newTitleInput = document.getElementById('new-title');
  if (newTitleInput) {
    newTitleInput.value = '';
    newTitleInput.dispatchEvent(new Event('input', { bubbles: true }));
  }
  await addEventToTray({
    title: item.title,
    memo: item.memo || '',
    duration: item.duration || 1,
    time: item.time || null,
  });
  if (typeof showFeedback === 'function') {
    showFeedback(`「${item.title}」をトレイに追加しました`);
  }
}

// 履歴用リスナー設定
document.addEventListener('DOMContentLoaded', () => {
  const newTitleInput = document.getElementById('new-title');
  const historyDropdown = document.getElementById('history-dropdown');
  if (!newTitleInput || !historyDropdown) return;

  newTitleInput.addEventListener('focus', () => {
    renderHistoryDropdown(newTitleInput.value);
  });

  newTitleInput.addEventListener("focusout", (e) => {
    if (e.relatedTarget && e.relatedTarget.closest && e.relatedTarget.closest('.input-history-wrapper')) {
      return;
    }
    setTimeout(() => {
      hideHistoryDropdown();
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
      hideHistoryDropdown();
    }
  });

  newTitleInput.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      hideHistoryDropdown();
    }
  });
});
