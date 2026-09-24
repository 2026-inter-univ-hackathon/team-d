// ============================================================
// 各種ダイアログ・詳細モーダル・インポート
// ============================================================
let pendingStatus = null;

let detailDateInput;
let detailEndDateInput;
let detailTimeSelect;
let detailEndTimeSelect;
let detailRepeatTimeSelect;
let detailRepeatEndTimeSelect;
let detailRepeatStartInput;
let detailRepeatEndInput;
let detailDatetimeRowsEl;
let bulkScheduleDialog;

function updateDetailEndPreview() {
  const previewEl = document.getElementById('detail-end-preview');
  if (!previewEl) return;
  const dateVal = detailDateInput ? detailDateInput.value : '';
  const endDateVal = detailEndDateInput ? detailEndDateInput.value : '';
  const timeVal = detailTimeSelect ? detailTimeSelect.value : '';
  const endTimeVal = detailEndTimeSelect ? detailEndTimeSelect.value : '';

  if (!dateVal) {
    previewEl.textContent = '';
    return;
  }
  const durVal = calcDurationFromDatesAndTimes(dateVal, timeVal, endDateVal, endTimeVal);
  const formattedDur = formatDuration(durVal);
  const effectiveEndD = endDateVal || dateVal;

  if (effectiveEndD === dateVal && !timeVal) {
    previewEl.innerHTML = `<span>📅 終日予定 (${formattedDur})</span>`;
  } else if (effectiveEndD === dateVal) {
    const endT = endTimeVal || (timeVal ? calcEndTime(timeVal, 1) : '');
    previewEl.innerHTML = `<span>📅 終了: ${endT} (${formattedDur})</span>`;
  } else {
    const endT = endTimeVal ? ` ${endTimeVal}` : '';
    previewEl.innerHTML = `<span style="color: var(--primary);">📅 終了: ${effectiveEndD}${endT} (${formattedDur} / 日付またぎ)</span>`;
  }
}

function initDialogElements() {
  detailDateInput = document.getElementById('detail-date');
  detailEndDateInput = document.getElementById('detail-end-date');
  detailTimeSelect = document.getElementById('detail-time');
  detailEndTimeSelect = document.getElementById('detail-end-time');
  detailRepeatTimeSelect = document.getElementById('detail-repeat-time');
  detailRepeatEndTimeSelect = document.getElementById('detail-repeat-end-time');
  detailRepeatStartInput = document.getElementById('detail-repeat-start');
  detailRepeatEndInput = document.getElementById('detail-repeat-end');
  detailDatetimeRowsEl = document.getElementById('detail-datetime-rows');
  bulkScheduleDialog = document.getElementById('bulk-schedule-dialog');

  if (detailDateInput) {
    detailDateInput.addEventListener('change', () => {
      const startVal = detailDateInput.value;
      if (startVal && detailEndDateInput) {
        if (!detailEndDateInput.value || detailEndDateInput.value < startVal) {
          detailEndDateInput.value = startVal;
        }
      }
      updateDetailEndPreview();
    });
  }

  if (detailEndDateInput) {
    detailEndDateInput.addEventListener('change', () => {
      if (detailDateInput && detailDateInput.value && detailEndDateInput.value) {
        if (detailEndDateInput.value < detailDateInput.value) {
          detailEndDateInput.value = detailDateInput.value;
        }
      }
      updateDetailEndPreview();
    });
  }

  if (detailTimeSelect && detailEndTimeSelect) {
    detailTimeSelect.addEventListener('change', () => {
      const startT = detailTimeSelect.value;
      if (startT && !detailEndTimeSelect.value) {
        detailEndTimeSelect.value = calcEndTime(startT, 1);
      }
      updateDetailEndPreview();
    });

    detailEndTimeSelect.addEventListener('change', () => {
      const startT = detailTimeSelect.value;
      const endT = detailEndTimeSelect.value;
      if (startT && endT && detailDateInput && detailEndDateInput) {
        // もし終了日が開始日と同じで、終了時刻が開始時刻より前の場合は終了日を翌日に自動進める
        if (detailDateInput.value && detailEndDateInput.value === detailDateInput.value) {
          if (timeToHours(endT) < timeToHours(startT)) {
            const nextD = new Date(detailDateInput.value + 'T00:00:00');
            nextD.setDate(nextD.getDate() + 1);
            detailEndDateInput.value = dateStr(nextD);
          }
        }
      }
      updateDetailEndPreview();
    });
  }

  if (detailRepeatTimeSelect && detailRepeatEndTimeSelect) {
    bindTimeAndDuration(detailRepeatTimeSelect, detailRepeatEndTimeSelect);
  }

  // ダイアログ用曜日ピルのクリック連動
  document.querySelectorAll('#bulk-schedule-dialog .weekday-pill').forEach(pill => {
    const checkbox = pill.querySelector('input[type="checkbox"]');
    if (!checkbox) return;
    pill.addEventListener('click', () => {
      setTimeout(() => {
        pill.classList.toggle('checked', checkbox.checked);
      }, 0);
    });
  });

  // 予定の追加（常にトレイへ：日時はドラッグで割り当てる）
  const addEventBtn = document.getElementById('add-event');
  if (addEventBtn) {
    addEventBtn.addEventListener('click', async () => {
      const input = document.getElementById('new-title') || document.getElementById('new-event-title');
      const title = input ? input.value.trim() : '';
      if (!title) return;
      const events = loadEvents();
      events.push({
        id: uid(),
        title,
        memo: '',
        status: 'TENTATIVE',
        date: null,
        time: null,
        duration: 1,
        createdAt: Date.now(),
        remindedOn: null,
      });
      if (!await saveEvents(events)) return;
      if (typeof recordHistory === 'function') recordHistory(title);
      if (input) input.value = '';
      if (typeof hideHistoryDropdown === 'function') {
        hideHistoryDropdown();
      } else {
        const historyDropdown = document.getElementById('history-dropdown');
        if (historyDropdown) historyDropdown.style.display = 'none';
      }
      renderAll();
    });
  }

  const newTitleInput = document.getElementById('new-title');
  if (newTitleInput) {
    newTitleInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        if (typeof hideHistoryDropdown === 'function') {
          hideHistoryDropdown();
        } else {
          const historyDropdown = document.getElementById('history-dropdown');
          if (historyDropdown) historyDropdown.style.display = 'none';
        }
        const addEventBtn = document.getElementById('add-event');
        if (addEventBtn) addEventBtn.click();
      }
    });
  }

  const addDatetimeRowBtn = document.getElementById('detail-add-datetime-row');
  if (addDatetimeRowBtn) {
    addDatetimeRowBtn.addEventListener('click', () => addDetailDatetimeRow());
  }

  const bulkExpandBtn = document.getElementById('detail-bulk-expand-btn');
  if (bulkExpandBtn) {
    bulkExpandBtn.addEventListener('click', handleBulkExpand);
  }

  const loadToInputBtn = document.getElementById('detail-load-to-input');
  if (loadToInputBtn) {
    loadToInputBtn.addEventListener('click', handleLoadToInput);
  }

  const detailSaveBtn = document.getElementById('detail-save');
  if (detailSaveBtn) {
    detailSaveBtn.addEventListener('click', handleDetailSave);
  }

  const clearDateBtn = document.getElementById('detail-clear-date');
  if (clearDateBtn) {
    clearDateBtn.addEventListener('click', handleClearDate);
  }

  const deleteBtn = document.getElementById('detail-delete');
  if (deleteBtn) {
    deleteBtn.addEventListener('click', handleDetailDelete);
  }

  const closeBtn = document.getElementById('detail-close-btn');
  if (closeBtn) {
    closeBtn.addEventListener('click', closeDetail);
  }

  const favoriteBtn = document.getElementById('detail-favorite');
  if (favoriteBtn) {
    favoriteBtn.addEventListener('click', handleDetailFavorite);
  }

  const memoEl = document.getElementById('detail-memo');
  if (memoEl) {
    memoEl.addEventListener('input', (e) => adjustHeight(e.target));
  }

  ['tentative', 'confirmed', 'completed'].forEach(s => {
    const el = document.getElementById(`status-${s}`);
    if (el) {
      el.addEventListener('click', () => {
        pendingStatus = s.toUpperCase();
        highlightStatus(pendingStatus);
      });
    }
  });

  initImportFeature();
}

function createDetailDatetimeRow(initialDate = '', initialTime = '', initialEndTime = '') {
  const row = document.createElement('nav');
  row.className = 'datetime-row';

  const dateInputWrapper = document.createElement("div");
  dateInputWrapper.classList.add("field", "border", "small");
  dateInputWrapper.style.margin = '0';
  const dateInput = document.createElement('input');
  dateInput.type = 'date';
  dateInput.className = 'row-date';
  dateInput.value = initialDate || todayStr();
  dateInputWrapper.appendChild(dateInput);

  function createDownIcon() {
    const icon = document.createElement('i');
    icon.textContent = 'arrow_drop_down';
    return icon;
  }

  const timeSelectWrapper = document.createElement("div");
  timeSelectWrapper.classList.add("field", "border", "suffix");
  timeSelectWrapper.style.margin = '0';

  const timeSelect = document.createElement('select');
  timeSelect.className = 'row-time';
  timeSelect.innerHTML = getTimeOptionsHtml(initialTime);
  timeSelectWrapper.append(timeSelect, createDownIcon());

  const toSpan = document.createElement('span');
  toSpan.textContent = '〜';

  const endTimeSelectWrapper = document.createElement("div");
  endTimeSelectWrapper.classList.add("field", "border", "suffix");
  endTimeSelectWrapper.style.margin = '0';

  const endTimeSelect = document.createElement('select');
  endTimeSelect.className = 'row-end-time';
  endTimeSelect.innerHTML = getEndTimeOptionsHtml(initialEndTime);
  endTimeSelectWrapper.append(endTimeSelect, createDownIcon());

  bindTimeAndDuration(timeSelect, endTimeSelect);

  const removeBtn = document.createElement('button');
  removeBtn.type = 'button';
  removeBtn.className = 'secondary small-btn';
  removeBtn.textContent = '✕ 削除';
  removeBtn.addEventListener('click', () => {
    if (detailDatetimeRowsEl.children.length <= 1) {
      dateInput.value = todayStr();
      timeSelect.value = '';
      endTimeSelect.value = '';
      return;
    }
    row.remove();
  });

  row.appendChild(dateInputWrapper);
  row.appendChild(timeSelectWrapper);
  row.appendChild(toSpan);
  row.appendChild(endTimeSelectWrapper);
  row.appendChild(removeBtn);

  return row;
}

function addDetailDatetimeRow(initialDate = '') {
  let nextDate = initialDate;
  if (!nextDate && detailDatetimeRowsEl) {
    const lastRow = detailDatetimeRowsEl.lastElementChild;
    if (lastRow) {
      const lastDateVal = lastRow.querySelector('.row-date')?.value;
      if (lastDateVal) {
        const d = new Date(lastDateVal + 'T00:00:00');
        d.setDate(d.getDate() + 1);
        nextDate = dateStr(d);
      }
    }
  }
  const ev = selectedEventId ? loadEvents().find(e => e.id === selectedEventId) : null;
  const curDur = ev?.duration || 1;
  const curTime = detailTimeSelect ? detailTimeSelect.value || '' : '';
  const curEndTime = curTime && curDur ? calcEndTime(curTime, curDur) : '';
  const row = createDetailDatetimeRow(nextDate, curTime, curEndTime);
  if (detailDatetimeRowsEl) detailDatetimeRowsEl.appendChild(row);
}

async function handleBulkExpand() {
  if (!selectedEventId) return;
  const events = loadEvents();
  const ev = events.find(e => e.id === selectedEventId);
  if (!ev) return;

  const title = document.getElementById('detail-title').value.trim() || ev.title;
  const memo = document.getElementById('detail-memo').value;
  const status = pendingStatus || ev.status || 'TENTATIVE';
  const baseDuration = (detailDurationInput ? parseFloat(detailDurationInput.value) : 0) || ev.duration || 1;

  const isMultiple = document.getElementById('multiple-datetime-tab')?.classList.contains('active');
  const scheduleItems = [];

  if (isMultiple) {
    const rows = Array.from(detailDatetimeRowsEl.querySelectorAll('.datetime-row'));
    rows.forEach(r => {
      const dVal = r.querySelector('.row-date')?.value;
      const tVal = r.querySelector('.row-time')?.value || null;
      const etVal = r.querySelector('.row-end-time')?.value || null;
      if (dVal) {
        const dur = (tVal && etVal) ? Math.max(0.25, timeToHours(etVal) - timeToHours(tVal)) : baseDuration;
        scheduleItems.push({
          date: dVal,
          time: tVal,
          endTime: (tVal && etVal) ? etVal : null,
          isEndTimeUnset: !!(tVal && !etVal),
          duration: dur
        });
      }
    });
    if (scheduleItems.length === 0) {
      alert('日時を1件以上指定してください。');
      return;
    }
  } else {
    const checkedDays = Array.from(document.querySelectorAll('#bulk-schedule-dialog input[name="detail-repeat-day"]:checked'))
      .map(cb => parseInt(cb.value, 10));
    if (checkedDays.length === 0) {
      alert('繰り返し対象の曜日を1つ以上選択してください。');
      return;
    }
    const startStr = detailRepeatStartInput.value;
    const endStr = detailRepeatEndInput.value;
    if (!startStr || !endStr) {
      alert('開始日と終了日を指定してください。');
      return;
    }
    const startDate = new Date(startStr + 'T00:00:00');
    const endDate = new Date(endStr + 'T00:00:00');
    if (startDate > endDate) {
      alert('開始日は終了日以前の日付を指定してください。');
      return;
    }
    const t = detailRepeatTimeSelect.value || null;
    const et = detailRepeatEndTimeSelect.value || null;
    const dur = (t && et) ? Math.max(0.25, timeToHours(et) - timeToHours(t)) : baseDuration;
    const cur = new Date(startDate);
    let count = 0;
    const maxLimit = 150;
    while (cur <= endDate && count < maxLimit) {
      if (checkedDays.includes(cur.getDay())) {
        scheduleItems.push({
          date: dateStr(cur),
          time: t,
          endTime: (t && et) ? et : null,
          isEndTimeUnset: !!(t && !et),
          duration: dur
        });
        count++;
      }
      cur.setDate(cur.getDate() + 1);
    }
    if (scheduleItems.length === 0) {
      alert('指定した期間内に該当する曜日の日付がありませんでした。');
      return;
    }
  }

  const first = scheduleItems[0];
  ev.title = title;
  ev.memo = memo;
  ev.status = status;
  ev.date = first.date;
  ev.time = first.time;
  ev.endTime = first.endTime;
  ev.isEndTimeUnset = first.isEndTimeUnset;
  ev.duration = first.duration;

  for (let i = 1; i < scheduleItems.length; i++) {
    const item = scheduleItems[i];
    events.push({
      id: uid(),
      title,
      memo,
      status,
      date: item.date,
      time: item.time,
      endTime: item.endTime,
      isEndTimeUnset: item.isEndTimeUnset,
      duration: item.duration,
      createdAt: Date.now(),
      remindedOn: null,
    });
  }

  if (!await saveEvents(events)) return;
  if (typeof recordHistory === 'function') recordHistory(title, memo, baseDuration, first.time || '');
  viewDate = new Date(first.date + 'T00:00:00');
  if (typeof ui === 'function') ui('#bulk-schedule-dialog');
  closeDetail();
  renderAll();
  showFeedback(`「${title}」を${scheduleItems.length}件の日程に一括展開しました 📅`);
}

function handleLoadToInput() {
  if (!selectedEventId) return;
  const events = loadEvents();
  const ev = events.find(e => e.id === selectedEventId);
  if (!ev) return;

  const title = document.getElementById('detail-title').value.trim() || ev.title;
  const titleInput = document.getElementById('new-title');
  if (titleInput) {
    titleInput.value = title;
  }
  closeDetail();
  if (typeof ui === 'function') ui('#add-event-dialog');
  if (titleInput) titleInput.focus();
  showFeedback(`「${title}」を入力欄に読み込みました 📝`);
}

function openDetail(id) {
  if (detailSection && !detailSection.hidden && selectedEventId === id) {
    closeDetail();
    return;
  }
  window.location.hash = `#${id}`;
  selectedEventId = id;
  pendingStatus = null;
  const ev = loadEvents().find(e => e.id === id);
  if (!ev) return;

  document.getElementById('detail-title').value = ev.title;
  document.getElementById('detail-memo').value = ev.memo || '';
  if (detailDateInput) detailDateInput.value = ev.date || '';
  if (detailEndDateInput) {
    detailEndDateInput.value = ev.date ? calcEndDate(ev.date, ev.time, ev.duration || 1) : '';
  }
  if (detailTimeSelect) detailTimeSelect.innerHTML = getTimeOptionsHtml(ev.time || '');
  const currentEndTime = ev.endTime || (ev.time && ev.duration ? calcEndTime(ev.time, ev.duration) : '');
  if (detailEndTimeSelect) detailEndTimeSelect.innerHTML = getEndTimeOptionsHtml(currentEndTime);

  if (detailRepeatTimeSelect) detailRepeatTimeSelect.innerHTML = getTimeOptionsHtml(ev.time || '');
  if (detailRepeatEndTimeSelect) detailRepeatEndTimeSelect.innerHTML = getEndTimeOptionsHtml(ev.endTime || '');

  if (detailDatetimeRowsEl) {
    detailDatetimeRowsEl.innerHTML = '';
    const initialDate = ev.date || todayStr();
    const initialEndTime = ev.endTime || (ev.time && ev.duration ? calcEndTime(ev.time, ev.duration) : '');
    detailDatetimeRowsEl.appendChild(createDetailDatetimeRow(initialDate, ev.time || '', initialEndTime));
  }

  const initialDate = ev.date || todayStr();
  if (detailRepeatStartInput) detailRepeatStartInput.value = initialDate;
  if (detailRepeatEndInput) {
    const defaultEndDate = new Date(initialDate + 'T00:00:00');
    defaultEndDate.setDate(defaultEndDate.getDate() + 30);
    detailRepeatEndInput.value = dateStr(defaultEndDate);
  }
  const evDateObj = new Date(initialDate + 'T00:00:00');
  const dayOfWeek = evDateObj.getDay();
  document.querySelectorAll('#bulk-schedule-dialog .weekday-pill').forEach(pill => {
    const cb = pill.querySelector('input[type="checkbox"]');
    if (!cb) return;
    const shouldCheck = parseInt(cb.value, 10) === dayOfWeek;
    cb.checked = shouldCheck;
    pill.classList.toggle('checked', shouldCheck);
  });

  const tabLinks = document.querySelectorAll('#bulk-schedule-dialog .tabs a');
  if (tabLinks.length >= 2) {
    tabLinks[0].classList.add('active');
    tabLinks[1].classList.remove('active');
  }
  const pageMulti = document.getElementById('multiple-datetime-tab');
  const pageWeekly = document.getElementById('weekly-repeat-tab');
  if (pageMulti) pageMulti.classList.add('active');
  if (pageWeekly) pageWeekly.classList.remove('active');

  highlightStatus(ev.status);
  updateDetailEndPreview();
  const calendarSection = document.getElementById('calendar-section');
  if (calendarSection) calendarSection.className = 's12 m7 l8';
  if (detailSection) {
    detailSection.className = 's12 m5 l4';
    detailSection.style.display = 'block';
  }
  adjustHeight(document.getElementById('detail-memo'));
}

function highlightStatus(status) {
  const statusEl = document.querySelector(".current-status");
  if (statusEl) {
    if (status === 'TENTATIVE') {
      statusEl.textContent = '未確定';
    } else if (status === 'CONFIRMED') {
      statusEl.textContent = '確定';
    } else if (status === 'COMPLETED') {
      statusEl.textContent = '完了';
    }
  }
  ['tentative', 'confirmed', 'completed'].forEach(s => {
    const el = document.getElementById(`status-${s}`);
    if (el) el.className = s.toUpperCase() === status ? 'active' : '';
  });
}

function adjustHeight(target) {
  if (!target) return;
  const heightLimit = 20;
  target.style.height = 'auto';
  target.style.height = Math.min(target.scrollHeight, heightLimit * 48) + 'px';
}

async function handleDetailSave() {
  if (!selectedEventId) return;
  const events = loadEvents();
  const ev = events.find(e => e.id === selectedEventId);
  if (!ev) return;
  ev.title = document.getElementById('detail-title').value.trim() || ev.title;
  ev.memo = document.getElementById('detail-memo').value;

  const dateVal = detailDateInput ? detailDateInput.value : '';
  const endDateVal = detailEndDateInput ? detailEndDateInput.value : '';
  const timeVal = detailTimeSelect ? detailTimeSelect.value : '';
  const endTimeVal = detailEndTimeSelect ? detailEndTimeSelect.value : '';

  if (dateVal) {
    const calculatedDur = calcDurationFromDatesAndTimes(dateVal, timeVal, endDateVal, endTimeVal);
    ev.duration = Math.max(0.25, calculatedDur);
    ev.date = dateVal;
    ev.time = timeVal || null;
    ev.endTime = (timeVal && endTimeVal) ? endTimeVal : null;
    ev.isEndTimeUnset = !!(timeVal && !endTimeVal);
  } else {
    ev.date = null;
    ev.time = null;
    ev.endTime = null;
    ev.isEndTimeUnset = false;
  }

  if (pendingStatus) ev.status = pendingStatus;
  if (!await saveEvents(events)) return;
  pendingStatus = null;
  if (typeof recordHistory === 'function') recordHistory(ev.title, ev.memo, ev.duration, ev.time || '');

  if (ev.date) {
    viewDate = new Date(ev.date + 'T00:00:00');
  }

  closeDetail();
  renderAll();
  showFeedback(ev.date ? `「${ev.title}」の日時を保存しました 📅` : `「${ev.title}」を保存しました（トレイ内）`);
}

async function handleClearDate() {
  if (!selectedEventId) return;
  const events = loadEvents();
  const ev = events.find(e => e.id === selectedEventId);
  if (!ev) return;
  ev.date = null;
  ev.time = null;
  ev.endTime = null;
  ev.isEndTimeUnset = false;
  if (!await saveEvents(events)) return;
  closeDetail();
  renderAll();
  showFeedback(`「${ev.title}」の日時をクリアし、トレイに戻しました`);
}

async function handleDetailDelete() {
  if (!selectedEventId) return;
  const events = loadEvents().filter(e => e.id !== selectedEventId);
  if (!await saveEvents(events)) return;
  closeDetail();
  renderAll();
}

function closeDetail() {
  const dlg = document.getElementById('bulk-schedule-dialog');
  if (dlg && dlg.open) dlg.close();
  window.location.hash = '';
  selectedEventId = null;
  pendingStatus = null;
  if (detailSection) detailSection.style.display = 'none';
  const calendarSection = document.getElementById('calendar-section');
  if (calendarSection) calendarSection.className = 's12';
}

function handleDetailFavorite() {
  if (!selectedEventId) return;
  const events = loadEvents();
  const ev = events.find(e => e.id === selectedEventId);
  if (!ev) return;
  const title = document.getElementById('detail-title').value.trim() || ev.title;
  const memo = document.getElementById('detail-memo').value;
  const duration = ev.duration || 1;
  const time = ev.time || '';

  const favs = loadFavorites();
  const existing = favs.find(f => f.title === title);
  if (existing) {
    existing.memo = memo;
    existing.duration = duration;
    existing.time = time;
  } else {
    favs.push({
      id: 'fav_' + Date.now().toString(36),
      title,
      duration,
      memo,
      time
    });
  }
  saveFavorites(favs);
  renderFavorites();
  showFeedback(`「${title}」をお気に入りに保存しました ⭐`);
}

function initImportFeature() {
  let importRecords = null;
  const importFile = document.getElementById('import-file');
  const importPreview = document.getElementById('import-preview');
  const importSubmit = document.getElementById('import-submit');
  const fileSelectButton = document.getElementById('file-select-button');
  if (importFile && fileSelectButton && importPreview) {
    importFile.addEventListener('change', async () => {
      importRecords = null;
      if (importSubmit) importSubmit.disabled = true;
      const file = importFile.files[0];
      if (!file) { importPreview.textContent = ''; return; }
      try {
        if (file.size > 1024 * 1024) throw new Error('1MB以内のJSONファイルを選んでください。');
        const records = JSON.parse(await file.text());
        if (!Array.isArray(records) || records.length > 1000) throw new Error('予定の配列（1000件以内）を選んでください。');
        importRecords = records;
        importPreview.textContent = `${records.length}件の予定が見つかりました。「取り込みを実行」を押してください。`;
        if (importSubmit) importSubmit.disabled = !records.length;
      } catch (error) {
        importPreview.textContent = error.message;
        if (typeof showFeedback === 'function') {
          showFeedback(`ファイル読み込みエラー: ${error.message}`, true);
        }
      }
    });
  }
  if (importSubmit) {
    importSubmit.addEventListener('click', async () => {
      if (!importRecords || store.busy || loading) return;
      loading = true;
      lockCalendar(true);
      setSync('予定を取り込んでいます…');
      try {
        const result = await apiRequest('/api/events/import/', 'POST', { events: importRecords });
        await store.refresh();
        if (typeof renderAll === 'function') renderAll();
        const calendarContent = document.getElementById('calendar-content');
        if (calendarContent) calendarContent.hidden = false;
        const msg = `予定を取り込みました（${result.imported}件追加、${result.skipped}件スキップ） 📥`;
        setSync(msg);
        importRecords = null;
        importSubmit.disabled = true;
        if (importFile) importFile.value = '';
        if (importPreview) importPreview.textContent = '';
      } catch (error) {
        setSync(`予定の取り込みに失敗しました: ${error.message}`, true);
      } finally {
        loading = false;
        lockCalendar(false);
      }
    });
  }
}

document.addEventListener('DOMContentLoaded', () => {
  initDialogElements();

  if (window.location.hash) {
    setTimeout(() => {
      openDetail(window.location.hash.split("#")[1]);
    }, 300);
  }
});
