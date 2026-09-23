const test = require('node:test');
const assert = require('node:assert/strict');

const FirebaseEventsClient = require('../static/firebase-events.js');

class FakeTimestamp {
  constructor(milliseconds) { this.milliseconds = milliseconds; }
  toMillis() { return this.milliseconds; }
}

function setup() {
  const records = new Map();
  const paths = [];
  let nextId = 1;

  const snapshot = (reference) => ({
    id: reference.id,
    exists: records.has(reference.path),
    data: () => records.get(reference.path),
  });
  const document = (path, id) => ({
    path,
    id,
    collection: (name) => collection(`${path}/${name}`),
    set: async (data) => records.set(path, data),
    get: async () => snapshot({ path, id }),
  });
  const collection = (path) => ({
    doc: (id = `event-${nextId++}`) => document(`${path}/${id}`, id),
    orderBy: (field) => ({
      get: async () => {
        paths.push([path, field]);
        const prefix = `${path}/`;
        const docs = [...records.entries()]
          .filter(([key]) => key.startsWith(prefix) && !key.slice(prefix.length).includes('/'))
          .sort(([, left], [, right]) => left.createdAt.toMillis() - right.createdAt.toMillis())
          .map(([key]) => snapshot({ path: key, id: key.slice(prefix.length) }));
        return { docs };
      },
    }),
  });
  const db = {
    collection: (name) => collection(name),
    runTransaction: async (callback) => callback({
      get: async (reference) => snapshot(reference),
      set: (reference, data) => records.set(reference.path, data),
      delete: (reference) => records.delete(reference.path),
    }),
    batch: () => {
      const writes = [];
      return {
        set: (reference, data) => writes.push([reference.path, data]),
        commit: async () => writes.forEach(([path, data]) => records.set(path, data)),
      };
    },
  };
  const firebase = {
    firestore: {
      Timestamp: {
        now: () => new FakeTimestamp(2000),
        fromMillis: (value) => new FakeTimestamp(value),
      },
    },
  };
  const auth = { currentUser: { uid: 'owner-1' } };
  const client = FirebaseEventsClient.create({ firebase, auth, db });
  return { client, auth, records, paths };
}

const eventFields = {
  title: '予定', memo: '', status: 'TENTATIVE', date: null,
  time: null, duration: 1, remindedOn: null,
};

test('requires login before accessing a user collection', async () => {
  const { client, auth, records } = setup();
  auth.currentUser = null;
  await assert.rejects(client.list(), (error) => error.status === 401);
  assert.equal(records.size, 0);
});

test('creates and lists normalized events only under the signed-in uid', async () => {
  const { client, records, paths } = setup();
  const created = await client.create({ ...eventFields, title: ' 予定 ' });

  assert.equal(created.id, 'event-1');
  assert.equal(created.title, '予定');
  assert.equal(created.version, 1);
  assert.equal(created.createdAt, 2000);
  assert.ok(records.has('users/owner-1/events/event-1'));

  const listed = await client.list();
  assert.deepEqual(listed, [created]);
  assert.deepEqual(paths, [['users/owner-1/events', 'createdAt']]);
});

test('updates only the expected version and preserves creation time', async () => {
  const { client } = setup();
  const created = await client.create(eventFields);
  const updated = await client.update(created.id, { title: '更新後' }, 1);

  assert.equal(updated.title, '更新後');
  assert.equal(updated.version, 2);
  assert.equal(updated.createdAt, created.createdAt);
  await assert.rejects(
    client.update(created.id, { title: '古い更新' }, 1),
    (error) => error.status === 409
  );
});

test('deletes only the expected version', async () => {
  const { client, records } = setup();
  const created = await client.create(eventFields);
  const updated = await client.update(created.id, { memo: '更新' }, 1);

  await assert.rejects(client.delete(created.id, 1), (error) => error.status === 409);
  assert.equal(records.size, 1);
  assert.deepEqual(await client.delete(created.id, updated.version), { deleted: created.id });
  assert.equal(records.size, 0);
});

test('validates fields before writing to Firestore', async () => {
  const { client, records } = setup();
  for (const changes of [
    { ...eventFields, title: '' },
    { ...eventFields, status: 'unknown' },
    { ...eventFields, duration: 0 },
    { ...eventFields, time: '12:30' },
    { ...eventFields, unexpected: true },
  ]) {
    await assert.rejects(client.create(changes), FirebaseEventsClient.FirebaseEventsError);
  }
  assert.equal(records.size, 0);
});

test('imports legacy events idempotently with deterministic document ids', async () => {
  const { client, records } = setup();
  const legacy = [{
    id: 'old/id', ...eventFields, title: '以前の予定', createdAt: 1700000000000,
  }];

  assert.deepEqual(await client.import(legacy), { imported: 1, skipped: 0 });
  assert.deepEqual(await client.import(legacy), { imported: 0, skipped: 1 });
  assert.ok(records.has('users/owner-1/events/legacy-old%2Fid'));
  assert.equal(records.get('users/owner-1/events/legacy-old%2Fid').legacyId, 'old/id');
});

test('imports a minimal legacy event with defaults and the current timestamp', async () => {
  const { client, records } = setup();

  assert.deepEqual(
    await client.import([{ id: 'minimal', title: '最小の予定' }]),
    { imported: 1, skipped: 0 }
  );
  const stored = records.get('users/owner-1/events/legacy-minimal');
  assert.equal(stored.status, 'TENTATIVE');
  assert.equal(stored.duration, 1);
  assert.equal(stored.createdAt.toMillis(), 2000);
});

test('turns Firestore errors into safe Japanese messages', async () => {
  const { client } = setup();
  client.list = undefined;
  const broken = FirebaseEventsClient.create({
    firebase: { firestore: { Timestamp: { now() {} } } },
    auth: { currentUser: { uid: 'owner' } },
    db: {
      collection: () => ({
        doc: () => ({
          collection: () => ({
            orderBy: () => ({ get: async () => { throw { code: 'unavailable' }; } }),
          }),
        }),
      }),
    },
  });
  await assert.rejects(broken.list(), /通信できませんでした/);
});
