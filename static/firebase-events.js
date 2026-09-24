(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.FirebaseEventsClient = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, () => {
  const STATUSES = new Set(['TENTATIVE', 'CONFIRMED', 'COMPLETED']);
  const MUTABLE_FIELDS = new Set([
    'title', 'memo', 'status', 'date', 'time', 'duration', 'remindedOn',
  ]);
  const IMPORT_FIELDS = new Set([
    'id', 'title', 'memo', 'status', 'date', 'time', 'duration',
    'createdAt', 'remindedOn',
  ]);
  const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
  const TIME_PATTERN = /^(?:[01]\d|2[0-3]):00$/;

  class FirebaseEventsError extends Error {
    constructor(message, code = 'events/unknown', status = 400) {
      super(message);
      this.name = 'FirebaseEventsError';
      this.code = code;
      this.status = status;
    }
  }

  function normalizeError(error) {
    if (error instanceof FirebaseEventsError) return error;
    const code = typeof error?.code === 'string' ? error.code : 'events/unknown';
    const messages = {
      'permission-denied': '予定へアクセスできません。ログインし直してください。',
      unavailable: '通信できませんでした。接続を確認してください。',
      aborted: '別の画面で変更されています。最新の予定を読み直してください。',
    };
    return new FirebaseEventsError(
      messages[code] || '予定の処理に失敗しました。',
      code,
      code === 'permission-denied' ? 401 : 0
    );
  }

  function validateDate(value, fieldName) {
    if (value !== null && (typeof value !== 'string' || !DATE_PATTERN.test(value))) {
      throw new FirebaseEventsError(
        `${fieldName}はYYYY-MM-DD形式で入力してください。`,
        'validation/date'
      );
    }
    return value;
  }

  function normalizeFields(fields, { partial = false } = {}) {
    if (!fields || typeof fields !== 'object' || Array.isArray(fields)) {
      throw new FirebaseEventsError('予定の入力形式が正しくありません。', 'validation/event');
    }
    if (Object.keys(fields).some((key) => !MUTABLE_FIELDS.has(key))) {
      throw new FirebaseEventsError('対応していない予定項目が含まれています。', 'validation/event');
    }

    const source = partial ? fields : {
      memo: '', status: 'TENTATIVE', date: null, time: null,
      duration: 1, remindedOn: null, ...fields,
    };
    const result = {};

    if ('title' in source) {
      if (typeof source.title !== 'string' || !source.title.trim() || source.title.trim().length > 200) {
        throw new FirebaseEventsError('タイトルは1〜200文字で入力してください。', 'validation/title');
      }
      result.title = source.title.trim();
    } else if (!partial) {
      throw new FirebaseEventsError('タイトルを入力してください。', 'validation/title');
    }

    if ('memo' in source) {
      if (typeof source.memo !== 'string' || source.memo.length > 10000) {
        throw new FirebaseEventsError('メモは10,000文字以内で入力してください。', 'validation/memo');
      }
      result.memo = source.memo;
    }
    if ('status' in source) {
      if (!STATUSES.has(source.status)) {
        throw new FirebaseEventsError('予定のステータスが正しくありません。', 'validation/status');
      }
      result.status = source.status;
    }
    if ('date' in source) result.date = validateDate(source.date, '日付');
    if ('time' in source) {
      if (source.time !== null && (typeof source.time !== 'string' || !TIME_PATTERN.test(source.time))) {
        throw new FirebaseEventsError('時刻はHH:00形式で入力してください。', 'validation/time');
      }
      result.time = source.time;
    }
    if ('duration' in source) {
      if (!Number.isInteger(source.duration) || source.duration < 1 || source.duration > 8760) {
        throw new FirebaseEventsError('所要時間は1〜8760時間で入力してください。', 'validation/duration');
      }
      result.duration = source.duration;
    }
    if ('remindedOn' in source) result.remindedOn = validateDate(source.remindedOn, '通知日');

    if ('date' in result && result.date === null) result.time = null;
    const date = 'date' in result ? result.date : fields.date;
    if ('time' in result && result.time !== null && date === null) {
      throw new FirebaseEventsError('時刻を設定する場合は日付も必要です。', 'validation/time');
    }
    return result;
  }

  function eventFromSnapshot(snapshot) {
    const data = snapshot.data();
    if (!data?.createdAt || typeof data.createdAt.toMillis !== 'function') {
      throw new FirebaseEventsError('予定データを読み込めませんでした。', 'events/invalid-data');
    }
    return {
      id: snapshot.id,
      title: data.title,
      memo: data.memo,
      status: data.status,
      date: data.date,
      time: data.time,
      duration: data.duration,
      createdAt: data.createdAt.toMillis(),
      remindedOn: data.remindedOn,
      version: data.version,
    };
  }

  function create({ firebase, auth, db }) {
    if (!firebase?.firestore?.Timestamp || !auth || !db) {
      throw new FirebaseEventsError('Firestoreを初期化できませんでした。', 'config/firestore-missing');
    }

    function userCollection() {
      const user = auth.currentUser;
      if (!user?.uid) {
        throw new FirebaseEventsError('ログインしてください。', 'auth/required', 401);
      }
      return db.collection('users').doc(user.uid).collection('events');
    }

    async function list() {
      try {
        const snapshot = await userCollection().orderBy('createdAt').get();
        return snapshot.docs.map(eventFromSnapshot);
      } catch (error) {
        throw normalizeError(error);
      }
    }

    async function createEvent(fields) {
      try {
        const data = normalizeFields(fields);
        const reference = userCollection().doc();
        const createdAt = firebase.firestore.Timestamp.now();
        const stored = { ...data, version: 1, createdAt };
        await reference.set(stored);
        return eventFromSnapshot({ id: reference.id, data: () => stored });
      } catch (error) {
        throw normalizeError(error);
      }
    }

    async function update(id, fields, expectedVersion) {
      try {
        if (typeof id !== 'string' || !id || !Number.isInteger(expectedVersion)) {
          throw new FirebaseEventsError('予定の更新番号が必要です。', 'validation/version');
        }
        const changes = normalizeFields(fields, { partial: true });
        const reference = userCollection().doc(id);
        let updated;
        await db.runTransaction(async (transaction) => {
          const snapshot = await transaction.get(reference);
          if (!snapshot.exists) {
            throw new FirebaseEventsError('予定が見つかりません。', 'events/not-found', 404);
          }
          const current = snapshot.data();
          if (current.version !== expectedVersion) {
            throw new FirebaseEventsError(
              '別の画面で変更されています。最新の予定を読み直してください。',
              'events/conflict',
              409
            );
          }
          const nextFields = normalizeFields({
            title: current.title,
            memo: current.memo,
            status: current.status,
            date: current.date,
            time: current.time,
            duration: current.duration,
            remindedOn: current.remindedOn,
            ...changes,
          });
          updated = {
            ...nextFields,
            version: current.version + 1,
            createdAt: current.createdAt,
            ...('legacyId' in current ? { legacyId: current.legacyId } : {}),
          };
          transaction.set(reference, updated);
        });
        return eventFromSnapshot({ id, data: () => updated });
      } catch (error) {
        throw normalizeError(error);
      }
    }

    async function remove(id, expectedVersion) {
      try {
        if (typeof id !== 'string' || !id || !Number.isInteger(expectedVersion)) {
          throw new FirebaseEventsError('予定の更新番号が必要です。', 'validation/version');
        }
        const reference = userCollection().doc(id);
        await db.runTransaction(async (transaction) => {
          const snapshot = await transaction.get(reference);
          if (!snapshot.exists) {
            throw new FirebaseEventsError('予定が見つかりません。', 'events/not-found', 404);
          }
          if (snapshot.data().version !== expectedVersion) {
            throw new FirebaseEventsError(
              '別の画面で変更されています。最新の予定を読み直してください。',
              'events/conflict',
              409
            );
          }
          transaction.delete(reference);
        });
        return { deleted: id };
      } catch (error) {
        throw normalizeError(error);
      }
    }

    async function importEvents(records) {
      try {
        if (!Array.isArray(records) || records.length > 1000) {
          throw new FirebaseEventsError('予定の配列を指定してください。1回に取り込めるのは1000件までです。');
        }
        const prepared = records.map((record) => {
          if (!record || typeof record !== 'object' || Array.isArray(record)
              || Object.keys(record).some((key) => !IMPORT_FIELDS.has(key))
              || typeof record.id !== 'string' || !record.id || record.id.length > 100
              || (record.createdAt != null
                && (typeof record.createdAt !== 'number'
                  || !Number.isFinite(record.createdAt)
                  || record.createdAt < 0
                  || record.createdAt >= 253402300799000))) {
            throw new FirebaseEventsError('予定ファイルの形式が正しくありません。');
          }
          const eventFields = Object.fromEntries(
            [...MUTABLE_FIELDS]
              .filter((field) => field in record)
              .map((field) => [field, record[field]])
          );
          return {
            id: `legacy-${encodeURIComponent(record.id)}`,
            data: {
              ...normalizeFields(eventFields),
              version: 1,
              createdAt: record.createdAt == null
                ? firebase.firestore.Timestamp.now()
                : firebase.firestore.Timestamp.fromMillis(record.createdAt),
              legacyId: record.id,
            },
          };
        });

        const collection = userCollection();
        let imported = 0;
        let skipped = 0;
        for (let offset = 0; offset < prepared.length; offset += 400) {
          const batch = db.batch();
          let writes = 0;
          for (const item of prepared.slice(offset, offset + 400)) {
            const reference = collection.doc(item.id);
            if ((await reference.get()).exists) {
              skipped += 1;
            } else {
              batch.set(reference, item.data);
              imported += 1;
              writes += 1;
            }
          }
          if (writes) await batch.commit();
        }
        return { imported, skipped };
      } catch (error) {
        throw normalizeError(error);
      }
    }

    return { list, create: createEvent, update, delete: remove, import: importEvents };
  }

  return { create, FirebaseEventsError };
});
