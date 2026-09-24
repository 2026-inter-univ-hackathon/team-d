const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// calendar-utils.js のコードをロードして評価
const utilsCode = fs.readFileSync(path.join(__dirname, '../static/calendar-utils.js'), 'utf8');
const context = {
  document: { addEventListener: () => {} },
  localStorage: { getItem: () => null, setItem: () => {} },
  window: {},
};
vm.createContext(context);
vm.runInContext(utilsCode, context);

test('calcEndTime correctly formats same-day, next-day, and multi-day end times', () => {
  assert.equal(context.calcEndTime('10:00', 2), '12:00');
  assert.equal(context.calcEndTime('22:00', 4), '翌日 02:00');
  assert.equal(context.calcEndTime('10:00', 24), '翌日 10:00');
  assert.equal(context.calcEndTime('10:00', 48), '+2日 10:00');
  assert.equal(context.calcEndTime('10:00', 72), '+3日 10:00');
});

test('calcEndDate correctly calculates the end date for multi-day and overnight events', () => {
  // 同日内
  assert.equal(context.calcEndDate('2026-09-24', '10:00', 2), '2026-09-24');
  // 日付またぎ（22:00 から 4時間 -> 翌日 02:00）
  assert.equal(context.calcEndDate('2026-09-24', '22:00', 4), '2026-09-25');
  // 24時間（10:00 から 24時間 -> 翌日 10:00）
  assert.equal(context.calcEndDate('2026-09-24', '10:00', 24), '2026-09-25');
  // 48時間（10:00 から 48時間 -> 2日後 10:00）
  assert.equal(context.calcEndDate('2026-09-24', '10:00', 48), '2026-09-26');
  // 終日予定で 48時間（2日間）
  assert.equal(context.calcEndDate('2026-09-24', null, 48), '2026-09-25');
});

test('isEventOnDate identifies all dates an event spans across', () => {
  const overnightEv = { date: '2026-09-24', time: '22:00', duration: 4 };
  assert.equal(context.isEventOnDate(overnightEv, '2026-09-23'), false);
  assert.equal(context.isEventOnDate(overnightEv, '2026-09-24'), true);
  assert.equal(context.isEventOnDate(overnightEv, '2026-09-25'), true);
  assert.equal(context.isEventOnDate(overnightEv, '2026-09-26'), false);

  const multiDayEv = { date: '2026-09-24', time: '10:00', duration: 48 };
  assert.equal(context.isEventOnDate(multiDayEv, '2026-09-23'), false);
  assert.equal(context.isEventOnDate(multiDayEv, '2026-09-24'), true);
  assert.equal(context.isEventOnDate(multiDayEv, '2026-09-25'), true);
  assert.equal(context.isEventOnDate(multiDayEv, '2026-09-26'), true);
  assert.equal(context.isEventOnDate(multiDayEv, '2026-09-27'), false);
});

test('calcDurationFromTimes calculates duration including overnight end times', () => {
  assert.equal(context.calcDurationFromTimes('10:00', '14:00'), 4);
  assert.equal(context.calcDurationFromTimes('22:00', '02:00'), 4); // 自動で翌日と判定
  assert.equal(context.calcDurationFromTimes('22:00', '翌日 02:00'), 4);
  assert.equal(context.calcDurationFromTimes('10:00', '+1日 10:00'), 24);
  assert.equal(context.calcDurationFromTimes('10:00', '+2日 10:00'), 48);
});

test('calcDurationFromDatesAndTimes calculates duration from start/end dates and times', () => {
  // 15分刻み 10:00〜10:15 (0.25時間 / 15分)
  assert.equal(context.calcDurationFromDatesAndTimes('2026-09-24', '10:00', '2026-09-24', '10:15'), 0.25);
  // 同日 10:00〜14:00 (4時間)
  assert.equal(context.calcDurationFromDatesAndTimes('2026-09-24', '10:00', '2026-09-24', '14:00'), 4);
  // 翌日またぎ 22:00〜翌日02:00 (4時間)
  assert.equal(context.calcDurationFromDatesAndTimes('2026-09-24', '22:00', '2026-09-25', '02:00'), 4);
  // 2日間またぎ 10:00〜2日後10:00 (48時間)
  assert.equal(context.calcDurationFromDatesAndTimes('2026-09-24', '10:00', '2026-09-26', '10:00'), 48);
  // 終日予定 2日間 (2026-09-24〜2026-09-25: 48時間)
  assert.equal(context.calcDurationFromDatesAndTimes('2026-09-24', null, '2026-09-25', null), 48);
});

test('formatDuration produces human-friendly duration text', () => {
  assert.equal(context.formatDuration(0.25), '15分');
  assert.equal(context.formatDuration(1.5), '1時間30分');
  assert.equal(context.formatDuration(2), '2時間');
  assert.equal(context.formatDuration(24), '24時間 (1日間)');
  assert.equal(context.formatDuration(36), '36時間 (1日+12時間)');
  assert.equal(context.formatDuration(48), '48時間 (2日間)');
});
