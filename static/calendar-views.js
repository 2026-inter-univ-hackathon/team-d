// ============================================================
// カレンダー状態・描画・ビュー切り替え・DnD
// ============================================================
const HOUR_H = 64; // タイムラインの1時間あたりの高さ(px)。CSSの .hour-row の height と合わせる
let view = 'month';       // 'month' | 'timeline'
let viewDate = new Date(); // 月表示: この月を表示 / タイムライン: この日を表示
let selectedEventId = null;

let trayEl;
let monthViewEl;
let timelineViewEl;
let monthGridEl;
let timelineAlldayEl;
let timelineHoursEl;
let currentLabelEl;
let detailSection;
let wasDialogOpenOnDrag = false;

function initViewElements() {
  trayEl = document.getElementById('tray');
  monthViewEl = document.getElementById('month-view');
  timelineViewEl = document.getElementById('timeline-view');
  monthGridEl = document.getElementById('month-grid');
  timelineAlldayEl = document.getElementById('timeline-allday');
  timelineHoursEl = document.getElementById('timeline-hours');
  currentLabelEl = document.getElementById('current-label');
  detailSection = document.getElementById('detail-section');
}

// ============================================================
// 予定チップの生成（ドラッグ元・クリックで詳細表示）
// ============================================================
function createEventChip(ev) {
  const chip = document.createElement('div');
  chip.className = `event status-${ev.status.toLowerCase()}`;
  chip.textContent = `${ev.title || '(無題)'}`;
  chip.draggable = true;
  chip.dataset.id = ev.id;
  chip.title = ev.memo || ev.title;
  chip.addEventListener('dragstart', (e) => {
    const isFromTray = chip.closest('#tray') !== null || !ev.date;
    if (isFromTray) {
      wasDialogOpenOnDrag = true;
      if (typeof ui === 'function') ui("#add-event-dialog");
    }
    e.dataTransfer.setData('text/plain', ev.id);
    e.dataTransfer.effectAllowed = 'move';
  });
  chip.addEventListener('dragend', () => {
    if (wasDialogOpenOnDrag) {
      wasDialogOpenOnDrag = false;
      if (typeof ui === 'function') ui("#add-event-dialog");
    }
  });
  chip.addEventListener('click', (e) => {
    e.stopPropagation();
    if (typeof openDetail === 'function') openDetail(ev.id);
  });
  return chip;
}

function addDropHandlers(el, onDrop) {
  if (!el) return;
  el.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    el.classList.add('drag-over');
  });
  el.addEventListener('dragleave', () => el.classList.remove('drag-over'));
  el.addEventListener('drop', (e) => {
    e.preventDefault();
    el.classList.remove('drag-over');
    const id = e.dataTransfer.getData('text/plain');
    if (id) onDrop(id, e);
    if (wasDialogOpenOnDrag) {
      wasDialogOpenOnDrag = false;
      if (typeof ui === 'function') ui("#add-event-dialog");
    }
  });
}

// ============================================================
// 描画：未確定トレイ（日時未定の予定）
// ============================================================
function renderTray() {
  if (!trayEl) return;
  const events = typeof loadEvents === 'function' ? loadEvents() : [];
  trayEl.innerHTML = '';
  const untimed = events.filter(ev => !ev.date);
  if (untimed.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'muted';
    empty.innerHTML = '<span style="margin-top: auto; margin-bottom: auto;">トレイは空です</span>';
    trayEl.appendChild(empty);
  }
  untimed.forEach(ev => trayEl.appendChild(createEventChip(ev)));
}

// ============================================================
// 描画：月表示
// ============================================================
function renderMonth() {
  if (!monthGridEl || !currentLabelEl) return;
  monthGridEl.innerHTML = '';
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  currentLabelEl.textContent = `${year}年${month + 1}月`;

  ['日', '月', '火', '水', '木', '金', '土'].forEach(w => {
    const el = document.createElement('div');
    el.textContent = w;
    monthGridEl.appendChild(el);
  });

  const firstOfMonth = new Date(year, month, 1);
  const startOffset = firstOfMonth.getDay();
  const gridStart = new Date(year, month, 1 - startOffset);
  const events = typeof loadEvents === 'function' ? loadEvents() : [];
  const today = todayStr();

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cellCount = (startOffset + daysInMonth) > 35 ? 42 : 35;

  for (let i = 0; i < cellCount; i++) {
    const cellDate = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i);
    const cellStr = dateStr(cellDate);
    const cell = document.createElement('div');
    cell.className = 'day-cell';
    if (cellDate.getMonth() !== month) cell.classList.add('other-month');
    if (cellStr === today) cell.classList.add('today');

    const num = document.createElement('div');
    num.className = 'day-num';
    num.innerHTML = `<span class="center date">${cellDate.getDate()}</span>`;
    cell.appendChild(num);

    const dayEvents = events.filter(ev => ev.date === cellStr);
    const MAX_VISIBLE_EVENTS = 2;
    if (dayEvents.length >= 3) {
      dayEvents.slice(0, MAX_VISIBLE_EVENTS).forEach(ev => cell.appendChild(createEventChip(ev)));
      const moreEl = document.createElement('div');
      moreEl.className = 'more-events';
      moreEl.textContent = `+${dayEvents.length - MAX_VISIBLE_EVENTS}件`;
      moreEl.title = `他 ${dayEvents.length - MAX_VISIBLE_EVENTS} 件の予定があります（クリックで日別表示）`;
      cell.appendChild(moreEl);
    } else {
      dayEvents.forEach(ev => cell.appendChild(createEventChip(ev)));
    }

    cell.addEventListener('click', (e) => {
      if (e.target.closest('.event')) return;
      viewDate = new Date(cellDate);
      setView('timeline');
    });

    addDropHandlers(cell, async (id) => {
      const evs = loadEvents();
      const ev = evs.find(e => e.id === id);
      if (!ev) return;
      ev.date = cellStr; // 月表示では時刻は付けない
      if (!await saveEvents(evs)) return;
      renderAll();
    });

    monthGridEl.appendChild(cell);
  }
}

// ============================================================
// 描画：日別タイムライン（0〜23時）
// ============================================================
function renderTimeline() {
  if (!timelineAlldayEl || !timelineHoursEl || !currentLabelEl) return;
  const dayStr = dateStr(viewDate);
  const weekdayNames = ['日', '月', '火', '水', '木', '金', '土'];
  let labelText = `${viewDate.getFullYear()}年${viewDate.getMonth() + 1}月${viewDate.getDate()}日(${weekdayNames[viewDate.getDay()]})`;
  currentLabelEl.textContent = labelText;

  const events = (typeof loadEvents === 'function' ? loadEvents() : []).filter(ev => ev.date === dayStr);

  timelineAlldayEl.innerHTML = '';
  const untimed = events.filter(ev => !ev.time);
  if (untimed.length === 0) {
    const hint = document.createElement('div');
    hint.className = 'muted';
    hint.textContent = '時刻未定（この日に予定あり）';
    timelineAlldayEl.appendChild(hint);
  }
  untimed.forEach(ev => timelineAlldayEl.appendChild(createEventChip(ev)));
  addDropHandlers(timelineAlldayEl, async (id) => {
    const evs = loadEvents();
    const ev = evs.find(e => e.id === id);
    if (!ev) return;
    ev.date = dayStr;
    ev.time = null;
    if (!await saveEvents(evs)) return;
    renderAll();
  });

  timelineHoursEl.innerHTML = '';
  timelineHoursEl.style.position = 'relative';
  for (let h = 0; h < 24; h++) {
    const row = document.createElement('div');
    row.className = 'hour-row';

    const label = document.createElement('div');
    label.className = 'hour-label';
    label.textContent = `${pad2(h)}:00`;
    row.appendChild(label);

    const slot = document.createElement('div');
    slot.className = 'hour-events';
    row.appendChild(slot);

    addDropHandlers(row, async (id, e) => {
      const evs = loadEvents();
      const ev = evs.find(e2 => e2.id === id);
      if (!ev) return;
      ev.date = dayStr;
      let m = 0;
      if (e && e.clientY) {
        const offsetY = e.clientY - row.getBoundingClientRect().top;
        const q = Math.min(3, Math.max(0, Math.floor(offsetY / (HOUR_H / 4))));
        m = q * 15;
      }
      ev.time = `${pad2(h)}:${pad2(m)}`;
      if (!await saveEvents(evs)) return;
      renderAll();
    });

    timelineHoursEl.appendChild(row);
  }

  const timed = events
    .filter(ev => ev.time)
    .map(ev => ({ ev, start: timeToHours(ev.time), duration: ev.duration || 1 }));
  const { laneOf, laneCount } = assignLanes(timed);

  const overlay = document.createElement('div');
  overlay.className = 'timeline-events-overlay';
  overlay.style.height = (24 * HOUR_H) + 'px';
  timed.forEach(({ ev, start, duration }) => {
    const lane = laneOf[ev.id];
    const widthPct = 100 / laneCount;
    const chip = createTimedEventChip(ev, {
      top: (start * HOUR_H) + 'px',
      height: Math.max(14, (duration * HOUR_H - 2)) + 'px',
      left: `calc(${lane * widthPct}%)`,
      width: `calc(${widthPct}% - 4px)`,
    });
    overlay.appendChild(chip);
  });

  overlay.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  });
  overlay.addEventListener('drop', async (e) => {
    e.preventDefault();
    overlay.classList.remove('drag-over');
    const id = e.dataTransfer.getData('text/plain');
    if (!id) return;
    const y = e.clientY - timelineHoursEl.getBoundingClientRect().top;
    const totalHours = Math.min(23.75, Math.max(0, y / HOUR_H));
    const hour = Math.floor(totalHours);
    const minute = Math.min(3, Math.max(0, Math.floor((totalHours - hour) * 4))) * 15;
    const evs = loadEvents();
    const ev = evs.find(e2 => e2.id === id);
    if (!ev) return;
    ev.date = dayStr;
    ev.time = `${pad2(hour)}:${pad2(minute)}`;
    if (!await saveEvents(evs)) return;
    renderAll();
    if (wasDialogOpenOnDrag) {
      wasDialogOpenOnDrag = false;
      if (typeof ui === 'function') ui('#add-event-dialog');
    }
  });
  timelineHoursEl.appendChild(overlay);
}

function assignLanes(timedEvents) {
  const sorted = [...timedEvents].sort((a, b) => a.start - b.start);
  const laneEnds = [];
  const laneOf = {};
  sorted.forEach(({ ev, start, duration }) => {
    const end = start + duration;
    let lane = laneEnds.findIndex(endTime => endTime <= start);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(end);
    } else {
      laneEnds[lane] = end;
    }
    laneOf[ev.id] = lane;
  });
  return { laneOf, laneCount: Math.max(1, laneEnds.length) };
}

function createTimedEventChip(ev, style) {
  const chip = createEventChip(ev);
  chip.classList.add('timed-event');
  const dur = ev.duration || 1;
  if (dur <= 0.25) {
    chip.classList.add('short-event');
  }
  const endTime = calcEndTime(ev.time, dur);
  chip.innerHTML = `
    <span class="event-time-badge">${ev.time} - ${endTime}</span>
    <span class="event-title-text">${escapeHtml(ev.title || '(無題)')}</span>
  `;
  Object.assign(chip.style, style);

  const topHandle = document.createElement('div');
  topHandle.className = 'resize-handle resize-handle-top';
  topHandle.title = 'ドラッグして開始時刻を変更（15分刻み）';
  topHandle.addEventListener('dragstart', (e) => {
    e.preventDefault();
    e.stopPropagation();
  });
  topHandle.addEventListener('pointerdown', (e) => startResizeTop(e, ev.id, chip));
  chip.appendChild(topHandle);

  const bottomHandle = document.createElement('div');
  bottomHandle.className = 'resize-handle resize-handle-bottom';
  bottomHandle.title = 'ドラッグして所要時間を変更（15分刻み）';
  bottomHandle.addEventListener('dragstart', (e) => {
    e.preventDefault();
    e.stopPropagation();
  });
  bottomHandle.addEventListener('pointerdown', (e) => startResize(e, ev.id, chip));
  chip.appendChild(bottomHandle);
  return chip;
}

function startResizeTop(e, id, chipEl) {
  e.stopPropagation();
  const events = loadEvents();
  const ev = events.find(item => item.id === id);
  if (!ev || !ev.time) return;

  const initStartHours = timeToHours(ev.time);
  const initDuration = ev.duration || 1;
  const fixedEndHours = initStartHours + initDuration;
  let finalStartHours = initStartHours;
  let finalDuration = initDuration;
  let finalTimeStr = ev.time;

  const timeBadge = chipEl.querySelector('.event-time-badge');
  const startClientY = e.clientY;

  function onMove(moveEvent) {
    const deltaPx = moveEvent.clientY - startClientY;
    const deltaQuarters = Math.round(deltaPx / (HOUR_H / 4));
    const newStartQuarters = Math.round(initStartHours * 4) + deltaQuarters;
    const maxStartQuarters = Math.round(fixedEndHours * 4) - 1;
    const clampedQuarters = Math.min(maxStartQuarters, Math.max(0, newStartQuarters));

    finalStartHours = clampedQuarters / 4;
    finalDuration = fixedEndHours - finalStartHours;

    const h = Math.floor(finalStartHours);
    const m = (finalStartHours % 1) * 60;
    finalTimeStr = `${pad2(h)}:${pad2(Math.round(m))}`;

    chipEl.style.top = `${finalStartHours * HOUR_H}px`;
    chipEl.style.height = `${finalDuration * HOUR_H - 2}px`;
    if (timeBadge) {
      timeBadge.textContent = `${finalTimeStr} - ${calcEndTime(finalTimeStr, finalDuration)}`;
    }
  }

  async function onUp() {
    document.removeEventListener('pointermove', onMove);
    document.removeEventListener('pointerup', onUp);
    if (finalStartHours !== initStartHours || finalDuration !== initDuration) {
      ev.time = finalTimeStr;
      ev.duration = finalDuration;
      if (!await saveEvents(events)) return;
    }
    renderAll();
  }
  document.addEventListener('pointermove', onMove);
  document.addEventListener('pointerup', onUp);
}

function startResize(e, id, chipEl) {
  e.stopPropagation();
  const events = loadEvents();
  const ev = events.find(item => item.id === id);
  if (!ev) return;

  const startDuration = ev.duration || 1;
  const startClientY = e.clientY;
  let finalDuration = startDuration;
  const timeBadge = chipEl.querySelector('.event-time-badge');

  function onMove(moveEvent) {
    const deltaPx = moveEvent.clientY - startClientY;
    const deltaQuarters = Math.round(deltaPx / (HOUR_H / 4));
    const newQuarters = Math.round(startDuration * 4) + deltaQuarters;
    finalDuration = Math.min(24 * 4, Math.max(1, newQuarters)) / 4;
    chipEl.style.height = `${finalDuration * HOUR_H - 2}px`;
    if (timeBadge) {
      timeBadge.textContent = `${ev.time} - ${calcEndTime(ev.time, finalDuration)}`;
    }
  }

  async function onUp() {
    document.removeEventListener('pointermove', onMove);
    document.removeEventListener('pointerup', onUp);
    if (finalDuration !== startDuration) {
      ev.duration = finalDuration;
      if (!await saveEvents(events)) return;
    }
    renderAll();
  }
  document.addEventListener('pointermove', onMove);
  document.addEventListener('pointerup', onUp);
}

// ============================================================
// ビュー切り替え・日付移動
// ============================================================
function setView(next) {
  view = next;
  const cur = document.querySelector(".current");
  if (cur) cur.textContent = view === 'month' ? '月表示' : 'タイムライン';
  const vm = document.getElementById('view-month');
  if (vm) vm.className = view === 'month' ? 'active' : '';
  const vt = document.getElementById('view-timeline');
  if (vt) vt.className = view === 'timeline' ? 'active' : '';
  if (monthViewEl) monthViewEl.hidden = view !== 'month';
  if (timelineViewEl) timelineViewEl.hidden = view !== 'timeline';
  renderAll();
}

// ============================================================
// 全体描画
// ============================================================
function renderAll() {
  renderTray();
  if (view === 'month') renderMonth();
  else renderTimeline();
}

document.addEventListener('DOMContentLoaded', () => {
  initViewElements();

  if (trayEl) {
    addDropHandlers(trayEl, async (id) => {
      const events = loadEvents();
      const ev = events.find(e => e.id === id);
      if (!ev) return;
      ev.date = null;
      ev.time = null;
      if (!await saveEvents(events)) return;
      renderAll();
    });
  }

  const vm = document.getElementById('view-month');
  if (vm) vm.addEventListener('click', () => setView('month'));
  const vt = document.getElementById('view-timeline');
  if (vt) vt.addEventListener('click', () => setView('timeline'));

  const np = document.getElementById('nav-prev');
  if (np) {
    np.addEventListener('click', () => {
      if (view === 'month') viewDate = new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1);
      else viewDate = new Date(viewDate.getFullYear(), viewDate.getMonth(), viewDate.getDate() - 1);
      renderAll();
    });
  }

  const nn = document.getElementById('nav-next');
  if (nn) {
    nn.addEventListener('click', () => {
      if (view === 'month') viewDate = new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1);
      else viewDate = new Date(viewDate.getFullYear(), viewDate.getMonth(), viewDate.getDate() + 1);
      renderAll();
    });
  }

  const nt = document.getElementById('nav-today');
  if (nt) {
    nt.addEventListener('click', () => {
      viewDate = new Date();
      renderAll();
    });
  }
});
