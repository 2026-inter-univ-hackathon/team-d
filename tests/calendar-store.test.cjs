const test = require('node:test');
const assert = require('node:assert/strict');
const CalendarStore = require('../static/calendar-store.js');
const original = { id: 'a', title: '元の予定', memo: '', status: 'TENTATIVE', date: null, time: null, duration: 1, remindedOn: null, version: 1 };

test('save sends only changed fields with a version and commits the server result', async () => {
  const calls = [];
  const store = new CalendarStore(async (url, method, data) => {
    calls.push({ url, method, data });
    if (!method) return { events: [structuredClone(original)] };
    return { event: { ...original, ...data, version: 2 } };
  });
  await store.refresh();
  const next = store.load(); next[0].title = '変更';
  assert.equal(store.load()[0].title, '元の予定');
  await store.save(next);
  assert.deepEqual(calls[1], { url: '/api/events/a/', method: 'PATCH', data: { title: '変更', version: 1 } });
  assert.equal(store.load()[0].version, 2);
});

test('failed save reconciles actual server data without retaining the attempted edit', async () => {
  const store = new CalendarStore(async (url, method) => {
    if (method) throw new Error('保存失敗');
    return { events: [structuredClone(original)] };
  });
  await store.refresh();
  const next = store.load(); next[0].title = '未保存';
  await assert.rejects(store.save(next), /保存失敗/);
  assert.equal(store.load()[0].title, '元の予定');
  assert.equal(store.busy, false);
  assert.equal(store.ready, true);
});

test('connection loss disables further mutations until a successful refresh', async () => {
  const store = new CalendarStore(async () => { throw new Error('接続失敗'); });
  store.events = [structuredClone(original)]; store.ready = true;
  const next = store.load(); next[0].title = '変更';
  await assert.rejects(store.save(next), /接続失敗/);
  assert.equal(store.ready, false);
  await assert.rejects(store.save(next), /読み込み/);
});

test('create uses server ID, and deleting sends the current version', async () => {
  const calls = [];
  const store = new CalendarStore(async (url, method, data) => {
    calls.push({ url, method, data });
    if (!method) return { events: [] };
    if (method === 'POST') return { event: { ...data, id: 'server-id', version: 1 } };
    return { deleted: 'server-id' };
  });
  await store.refresh();
  await store.save([original]);
  assert.equal(store.load()[0].id, 'server-id');
  assert.equal(calls[1].data.id, undefined);
  await store.save([]);
  assert.deepEqual(calls[2], { url: '/api/events/server-id/', method: 'DELETE', data: { version: 1 } });
  assert.deepEqual(store.load(), []);
});

test('concurrent saves are rejected so rapid clicks cannot overwrite pending data', async () => {
  let finish;
  const store = new CalendarStore(() => new Promise(resolve => { finish = resolve; }));
  store.events = [structuredClone(original)]; store.ready = true;
  const next = store.load(); next[0].title = '変更';
  const saving = store.save(next);
  await assert.rejects(store.save(next), /読み込み/);
  finish({ event: { ...next[0], version: 2 } });
  await saving;
  assert.equal(store.load()[0].title, '変更');
});

test('calendar inline script parses after async API conversion', () => {
  const fs = require('node:fs');
  const vm = require('node:vm');
  const path = require('node:path');
  const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
  const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  assert.doesNotThrow(() => new vm.Script(script));
});
